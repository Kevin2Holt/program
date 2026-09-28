import { beforeEach, describe, expect, it } from "vitest";
import { createBlock, deleteBlock, duplicateBlock, loadEditorState, loadPublishedProgram, loadPublishStatus, publishProgram, reorderBlocks, rollBackProgram, saveHeader, unpublishProgram, updateBlock } from "../../src/lib/server/services/programService.js";
import { clearAllTables, sql } from "../helpers/database.js";
import { createTestEvent, createTestUser } from "../helpers/factories.js";


let eventId;

beforeEach(async () => {
	await clearAllTables();
	const owner = await createTestUser();
	eventId = (await createTestEvent(owner.id)).id;
});


async function addLabelValueBlock(label, position = null) {

	const result = await createBlock(eventId, { type: "label_value", position, content: { rows: [{ id: "a", label, value: "v" }] } });
	return result.value.block;
}

async function listDraftLabels() {

	const state = await loadEditorState(eventId);
	return state.blocks.map((block) => block.content.rows?.[0]?.label ?? block.type);
}


describe("block ordering", () => {
	it("starts with an empty draft", async () => {
		const state = await loadEditorState(eventId);
		expect(state.blocks).toEqual([]);
		expect(state.status).toMatchObject({ isPublished: false, hasPrevious: false, hasUnpublishedChanges: true });
	});

	it("appends by default and inserts between blocks by position", async () => {
		await addLabelValueBlock("A");
		await addLabelValueBlock("C");
		await addLabelValueBlock("B", 1);
		await addLabelValueBlock("Start", 0);
		expect(await listDraftLabels()).toEqual(["Start", "A", "B", "C"]);
	});

	it("duplicates right after the source", async () => {
		const first = await addLabelValueBlock("A");
		await addLabelValueBlock("B");
		await duplicateBlock(eventId, first.id);
		expect(await listDraftLabels()).toEqual(["A", "A", "B"]);
	});

	it("deletes and restores a block in its old position (undo)", async () => {
		await addLabelValueBlock("A");
		const middle = await addLabelValueBlock("B");
		await addLabelValueBlock("C");
		const deleted = (await deleteBlock(eventId, middle.id)).value.deleted;
		expect(await listDraftLabels()).toEqual(["A", "C"]);
		await createBlock(eventId, { type: deleted.type, position: deleted.position, content: deleted.content });
		expect(await listDraftLabels()).toEqual(["A", "B", "C"]);
	});

	it("reorders only to a permutation of the same blocks", async () => {
		const a = await addLabelValueBlock("A");
		const b = await addLabelValueBlock("B");
		const c = await addLabelValueBlock("C");
		expect((await reorderBlocks(eventId, [c.id, a.id, b.id])).ok).toBe(true);
		expect(await listDraftLabels()).toEqual(["C", "A", "B"]);
		expect((await reorderBlocks(eventId, [a.id, b.id])).ok).toBe(false);
		expect((await reorderBlocks(eventId, [a.id, b.id, 999999])).ok).toBe(false);
	});

	it("keeps block rows and block_order in sync after every kind of change", async () => {
		const a = await addLabelValueBlock("A");
		await addLabelValueBlock("B");
		await duplicateBlock(eventId, a.id);
		await deleteBlock(eventId, a.id);
		const [draft] = await sql`select id, block_order from program_versions where event_id = ${eventId} and kind = 'draft'`;
		const rows = await sql`select id from program_blocks where version_id = ${draft.id}`;
		expect([...draft.block_order].sort()).toEqual(rows.map((row) => row.id).sort());
	});
});

describe("block content", () => {
	it("sanitizes text HTML and normalizes label/value rows", async () => {
		const text = (await createBlock(eventId, { type: "text" })).value.block;
		const updated = await updateBlock(eventId, text.id, { content: { doc: { type: "doc" } }, html: "<p>Hi<script>x</script></p>" });
		expect(updated.value.block.html).toBe("<p>Hi</p>");

		const rows = (await createBlock(eventId, { type: "label_value" })).value.block;
		const saved = await updateBlock(eventId, rows.id, { content: { rows: [{ id: "x", label: "  Presiding ", value: " Bishop  " }] } });
		expect(saved.value.block.content.rows[0]).toEqual({ id: "x", label: "Presiding", value: "Bishop" });
	});

	it("rejects unknown block types", async () => {
		expect((await createBlock(eventId, { type: "embed" })).ok).toBe(false);
	});

	it("saves the header as trimmed plain fields", async () => {
		await saveHeader(eventId, { title: "  Elm Ward ", eyebrow: "Sacrament Meeting", extra: "ignored" });
		const state = await loadEditorState(eventId);
		expect(state.header).toEqual({ eyebrow: "Sacrament Meeting", title: "Elm Ward", date: "", time: "", place: "" });
	});
});

describe("publishing", () => {
	it("publishes a copy that later draft edits don't touch", async () => {
		const block = await addLabelValueBlock("Before");
		await publishProgram(eventId);
		expect((await loadPublishStatus(eventId)).hasUnpublishedChanges).toBe(false);

		await updateBlock(eventId, block.id, { content: { rows: [{ id: "a", label: "After", value: "v" }] } });
		const published = await loadPublishedProgram(eventId);
		expect(published.blocks[0].content.rows[0].label).toBe("Before");
		expect((await loadPublishStatus(eventId)).hasUnpublishedChanges).toBe(true);
	});

	it("keeps the previous published version and rolls back and forth", async () => {
		const block = await addLabelValueBlock("Version 1");
		await publishProgram(eventId);
		await updateBlock(eventId, block.id, { content: { rows: [{ id: "a", label: "Version 2", value: "v" }] } });
		await publishProgram(eventId);

		const labelOf = async () => (await loadPublishedProgram(eventId)).blocks[0].content.rows[0].label;
		expect(await labelOf()).toBe("Version 2");
		expect((await rollBackProgram(eventId)).ok).toBe(true);
		expect(await labelOf()).toBe("Version 1");
		expect((await rollBackProgram(eventId)).ok).toBe(true);
		expect(await labelOf()).toBe("Version 2");
		// The draft is never changed by publishing or rollback.
		expect((await loadEditorState(eventId)).blocks[0].content.rows[0].label).toBe("Version 2");
	});

	it("keeps at most one row per version kind", async () => {
		await addLabelValueBlock("x");
		await publishProgram(eventId);
		await publishProgram(eventId);
		await publishProgram(eventId);
		const kinds = (await sql`select kind from program_versions where event_id = ${eventId} order by kind`).map((row) => row.kind);
		expect(kinds).toEqual(["draft", "previous", "published"]);
	});

	it("unpublishes, and roll back puts the last version live again", async () => {
		await addLabelValueBlock("Live");
		await publishProgram(eventId);
		expect((await unpublishProgram(eventId)).ok).toBe(true);
		expect(await loadPublishedProgram(eventId)).toBeNull();
		expect((await unpublishProgram(eventId)).ok).toBe(false);
		expect((await rollBackProgram(eventId)).ok).toBe(true);
		expect((await loadPublishedProgram(eventId)).blocks[0].content.rows[0].label).toBe("Live");
	});

	it("can't roll back without a previous version", async () => {
		expect((await rollBackProgram(eventId)).ok).toBe(false);
	});
});
