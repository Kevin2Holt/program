/*
	Data access for program versions and blocks. `db` is the shared client or a
	transaction. Callers that change block_order hold a row lock on the version.
*/
import { sql } from "../db.js";


const VERSION_COLUMNS = sql`id, event_id, kind, header, block_order, published_at, created_at, updated_at`;
const BLOCK_COLUMNS = sql`id, version_id, type, content, html, updated_at`;


export async function insertVersion(db, { eventId, kind, header = {}, blockOrder = [], publishedAt = null }) {

	const [version] = await db`
		insert into program_versions (event_id, kind, header, block_order, published_at)
		values (${eventId}, ${kind}, ${db.json(header)}, ${db.json(blockOrder)}, ${publishedAt})
		returning ${VERSION_COLUMNS}`;
	return version;
}

export async function findVersion(db, eventId, kind) {

	const [version] = await db`select ${VERSION_COLUMNS} from program_versions where event_id = ${eventId} and kind = ${kind}`;
	return version || null;
}

export async function lockVersion(db, eventId, kind) {

	const [version] = await db`select ${VERSION_COLUMNS} from program_versions where event_id = ${eventId} and kind = ${kind} for update`;
	return version || null;
}

export async function listVersions(eventId) {

	return sql`select ${VERSION_COLUMNS} from program_versions where event_id = ${eventId}`;
}

export async function listBlocks(db, versionId) {

	return db`select ${BLOCK_COLUMNS} from program_blocks where version_id = ${versionId}`;
}

export async function findBlock(db, versionId, blockId) {

	const [block] = await db`select ${BLOCK_COLUMNS} from program_blocks where version_id = ${versionId} and id = ${blockId}`;
	return block || null;
}

export async function insertBlock(db, { versionId, type, content, html }) {

	const [block] = await db`
		insert into program_blocks (version_id, type, content, html)
		values (${versionId}, ${type}, ${db.json(content)}, ${html})
		returning ${BLOCK_COLUMNS}`;
	return block;
}

export async function updateBlockContent(db, blockId, { content, html }) {

	const [block] = await db`
		update program_blocks set content = ${db.json(content)}, html = ${html}, updated_at = now()
		where id = ${blockId}
		returning ${BLOCK_COLUMNS}`;
	return block;
}

export async function deleteBlockRow(db, blockId) {

	await db`delete from program_blocks where id = ${blockId}`;
}

export async function updateBlockOrder(db, versionId, blockOrder) {

	await db`update program_versions set block_order = ${db.json(blockOrder)}, updated_at = now() where id = ${versionId}`;
}

export async function updateHeader(db, versionId, header) {

	await db`update program_versions set header = ${db.json(header)}, updated_at = now() where id = ${versionId}`;
}

export async function touchVersion(db, versionId) {

	await db`update program_versions set updated_at = now() where id = ${versionId}`;
}

export async function deleteVersion(db, versionId) {

	await db`delete from program_versions where id = ${versionId}`;
}

export async function updateVersionKind(db, versionId, kind) {

	await db`update program_versions set kind = ${kind} where id = ${versionId}`;
}
