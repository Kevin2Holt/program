/*
	Program rules: the draft is edited block by block; publishing deep-copies it
	into "published" (the old published becomes "previous"); rollback swaps
	published and previous; unpublish moves published to previous.

	Block order: program_versions.block_order is the source of truth. Every
	mutation locks the version row, changes blocks and block_order together in
	one transaction, and verifies they still match before committing.
*/
import { BLOCK_TYPES, checkBlockType, normalizeHeader } from "$lib/blocks/registry.js";
import { fail, RESULT_CODE, succeed } from "$lib/result.js";
import { sql } from "../db.js";
import { deleteBlockRow, deleteVersion, findBlock, findVersion, insertBlock, insertVersion, listBlocks, listVersions, lockVersion, touchVersion, updateBlockContent, updateBlockOrder, updateHeader, updateVersionKind } from "../data/programs.js";
import { touchEvent } from "../data/events.js";
import { sanitizeRichTextHtml } from "../sanitizeHtml.js";


export const VERSION_KIND = { draft: "draft", published: "published", previous: "previous" };


function orderBlocks(blocks, blockOrder) {

	const byId = new Map(blocks.map((block) => [block.id, block]));
	return blockOrder.map((blockId) => byId.get(blockId)).filter(Boolean);
}

function toClientBlock(block) {

	return { id: block.id, type: block.type, content: block.content, html: block.html || "" };
}

function prepareContent(type, rawContent, rawHtml) {

	const content = BLOCK_TYPES[type].normalizeContent(rawContent);
	const html = type === "text" ? sanitizeRichTextHtml(rawHtml) : null;
	return { content, html };
}

// Throws (rolling back the transaction) if blocks and block_order ever disagree.
export async function assertOrderMatchesBlocks(db, versionId) {

	const [version] = await db`select block_order from program_versions where id = ${versionId}`;
	const blockIds = (await db`select id from program_blocks where version_id = ${versionId}`).map((row) => row.id).sort((a, b) => a - b);
	const orderIds = [...version.block_order].sort((a, b) => a - b);
	const matches = blockIds.length === orderIds.length && blockIds.every((blockId, index) => blockId === orderIds[index]);
	if (!matches) {
		throw new Error(`program version ${versionId}: block_order does not match its blocks`);
	}
}

async function runDraftMutation(eventId, mutate) {

	return sql.begin(async (tx) => {
		const draft = await lockVersion(tx, eventId, VERSION_KIND.draft);
		if (!draft) {
			return fail(RESULT_CODE.notFound, "This event has no program draft.");
		}
		const result = await mutate(tx, draft);
		if (result.ok) {
			await assertOrderMatchesBlocks(tx, draft.id);
			await touchEvent(tx, eventId);
		}
		return result;
	});
}


export async function createDraftVersion(db, eventId) {

	return insertVersion(db, { eventId, kind: VERSION_KIND.draft });
}

export async function loadEditorState(eventId) {

	const versions = await listVersions(eventId);
	const byKind = Object.fromEntries(versions.map((version) => [version.kind, version]));
	const draft = byKind[VERSION_KIND.draft];
	const blocks = draft ? orderBlocks(await listBlocks(sql, draft.id), draft.block_order) : [];
	const published = byKind[VERSION_KIND.published] || null;
	return {
		header: normalizeHeader(draft?.header),
		blocks: blocks.map(toClientBlock),
		status: buildPublishStatus(draft, published, byKind[VERSION_KIND.previous] || null)
	};
}

function buildPublishStatus(draft, published, previous) {

	return {
		isPublished: Boolean(published),
		publishedAt: published?.published_at || null,
		hasPrevious: Boolean(previous),
		previousPublishedAt: previous?.published_at || null,
		hasUnpublishedChanges: Boolean(draft) && (!published || new Date(draft.updated_at) > new Date(published.published_at))
	};
}

export async function loadPublishStatus(eventId) {

	const versions = await listVersions(eventId);
	const byKind = Object.fromEntries(versions.map((version) => [version.kind, version]));
	return buildPublishStatus(byKind.draft, byKind.published || null, byKind.previous || null);
}

export async function loadPublishedProgram(eventId) {

	const published = await findVersion(sql, eventId, VERSION_KIND.published);
	if (!published) {
		return null;
	}
	const blocks = orderBlocks(await listBlocks(sql, published.id), published.block_order);
	return { header: normalizeHeader(published.header), blocks: blocks.map(toClientBlock), publishedAt: published.published_at };
}

// position: index in the order to insert at (default: end). content: optional (used by undo).
export async function createBlock(eventId, { type, position = null, content = null, html = "" }) {

	if (!checkBlockType(type)) {
		return fail(RESULT_CODE.invalid, "Unknown block type.");
	}
	return runDraftMutation(eventId, async (tx, draft) => {
		const prepared = prepareContent(type, content || BLOCK_TYPES[type].createDefaultContent(), html);
		const block = await insertBlock(tx, { versionId: draft.id, type, ...prepared });
		const order = [...draft.block_order];
		const index = Number.isInteger(position) ? Math.max(0, Math.min(order.length, position)) : order.length;
		order.splice(index, 0, block.id);
		await updateBlockOrder(tx, draft.id, order);
		return succeed({ block: toClientBlock(block), order });
	});
}

export async function updateBlock(eventId, blockId, { content, html = "" }) {

	return runDraftMutation(eventId, async (tx, draft) => {
		const block = await findBlock(tx, draft.id, blockId);
		if (!block) {
			return fail(RESULT_CODE.notFound, "That block no longer exists.");
		}
		const updated = await updateBlockContent(tx, blockId, prepareContent(block.type, content, html));
		await touchVersion(tx, draft.id);
		return succeed({ block: toClientBlock(updated) });
	});
}

export async function deleteBlock(eventId, blockId) {

	return runDraftMutation(eventId, async (tx, draft) => {
		const block = await findBlock(tx, draft.id, blockId);
		if (!block) {
			return fail(RESULT_CODE.notFound, "That block no longer exists.");
		}
		const position = draft.block_order.indexOf(blockId);
		const order = draft.block_order.filter((existingId) => existingId !== blockId);
		await deleteBlockRow(tx, blockId);
		await updateBlockOrder(tx, draft.id, order);
		return succeed({ order, deleted: { ...toClientBlock(block), position } });
	});
}

export async function duplicateBlock(eventId, blockId) {

	return runDraftMutation(eventId, async (tx, draft) => {
		const source = await findBlock(tx, draft.id, blockId);
		if (!source) {
			return fail(RESULT_CODE.notFound, "That block no longer exists.");
		}
		const copy = await insertBlock(tx, { versionId: draft.id, type: source.type, content: source.content, html: source.html });
		const order = [...draft.block_order];
		order.splice(order.indexOf(blockId) + 1, 0, copy.id);
		await updateBlockOrder(tx, draft.id, order);
		return succeed({ block: toClientBlock(copy), order });
	});
}

export async function reorderBlocks(eventId, requestedOrder) {

	return runDraftMutation(eventId, async (tx, draft) => {
		const current = [...draft.block_order].sort((a, b) => a - b);
		const requested = Array.isArray(requestedOrder) ? requestedOrder.map(Number) : [];
		const sortedRequested = [...requested].sort((a, b) => a - b);
		const sameSet = current.length === sortedRequested.length && current.every((blockId, index) => blockId === sortedRequested[index]);
		if (!sameSet) {
			return fail(RESULT_CODE.conflict, "The program changed in another window. Reload to see the latest.");
		}
		await updateBlockOrder(tx, draft.id, requested);
		return succeed({ order: requested });
	});
}

export async function saveHeader(eventId, rawHeader) {

	return runDraftMutation(eventId, async (tx, draft) => {
		const header = normalizeHeader(rawHeader);
		await updateHeader(tx, draft.id, header);
		return succeed({ header });
	});
}

export async function publishProgram(eventId) {

	return sql.begin(async (tx) => {
		const draft = await lockVersion(tx, eventId, VERSION_KIND.draft);
		if (!draft) {
			return fail(RESULT_CODE.notFound, "This event has no program draft.");
		}
		const published = await lockVersion(tx, eventId, VERSION_KIND.published);
		const previous = await lockVersion(tx, eventId, VERSION_KIND.previous);
		if (published) {
			if (previous) {
				await deleteVersion(tx, previous.id);
			}
			await updateVersionKind(tx, published.id, VERSION_KIND.previous);
		}

		const copy = await insertVersion(tx, { eventId, kind: VERSION_KIND.published, header: draft.header, publishedAt: new Date() });
		const draftBlocks = orderBlocks(await listBlocks(tx, draft.id), draft.block_order);
		const copiedIds = [];
		for (const block of draftBlocks) {
			const copiedBlock = await insertBlock(tx, { versionId: copy.id, type: block.type, content: block.content, html: block.html });
			copiedIds.push(copiedBlock.id);
		}
		await updateBlockOrder(tx, copy.id, copiedIds);
		await assertOrderMatchesBlocks(tx, copy.id);
		await touchEvent(tx, eventId);
		return succeed();
	});
}

export async function unpublishProgram(eventId) {

	return sql.begin(async (tx) => {
		const published = await lockVersion(tx, eventId, VERSION_KIND.published);
		if (!published) {
			return fail(RESULT_CODE.conflict, "The program isn't published.");
		}
		const previous = await lockVersion(tx, eventId, VERSION_KIND.previous);
		if (previous) {
			await deleteVersion(tx, previous.id);
		}
		// Kept as "previous" so Roll back can put it live again.
		await updateVersionKind(tx, published.id, VERSION_KIND.previous);
		await touchEvent(tx, eventId);
		return succeed();
	});
}

export async function rollBackProgram(eventId) {

	return sql.begin(async (tx) => {
		const previous = await lockVersion(tx, eventId, VERSION_KIND.previous);
		if (!previous) {
			return fail(RESULT_CODE.conflict, "There is no previous version to roll back to.");
		}
		const published = await lockVersion(tx, eventId, VERSION_KIND.published);
		// One statement swaps both kinds; the unique constraint is checked at its end.
		if (published) {
			await tx`update program_versions set kind = case kind when 'published' then 'previous' else 'published' end
				where id in (${published.id}, ${previous.id})`;
		}
		else {
			await updateVersionKind(tx, previous.id, VERSION_KIND.published);
		}
		await touchEvent(tx, eventId);
		return succeed();
	});
}
