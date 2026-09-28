/*
	Data access for events, codes, membership, and reserved words.
	Functions taking `db` accept either the shared client or a transaction.
*/
import { sql } from "../db.js";


const EVENT_COLUMNS = sql`e.id, e.name, e.code, e.accent_color, e.created_by, e.archived_at, e.created_at, e.updated_at`;


export async function checkReservedWord(word) {

	const [row] = await sql`select 1 from reserved_words where word = ${word}`;
	return Boolean(row);
}

export async function listReservedWords() {

	return (await sql`select word from reserved_words order by word`).map((row) => row.word);
}

export async function findEventIdUsingCode(code) {

	const [current] = await sql`select id from events where code = ${code}`;
	if (current) {
		return { eventId: current.id, isCurrent: true };
	}
	const [retired] = await sql`select event_id from event_old_codes where code = ${code}`;
	return retired ? { eventId: retired.event_id, isCurrent: false } : null;
}

export async function findEventByCode(code) {

	const [event] = await sql`select ${EVENT_COLUMNS} from events e where e.code = ${code}`;
	return event || null;
}

export async function findEventById(eventId) {

	const [event] = await sql`select ${EVENT_COLUMNS} from events e where e.id = ${eventId}`;
	return event || null;
}

export async function insertEvent(db, { name, code, createdBy }) {

	const [event] = await db`
		insert into events (name, code, created_by) values (${name}, ${code}, ${createdBy})
		returning id, name, code, created_by, archived_at, created_at, updated_at`;
	return event;
}

export async function insertEventMember(db, { eventId, userId, role }) {

	await db`insert into event_members (event_id, user_id, role) values (${eventId}, ${userId}, ${role})`;
}

export async function findMembership(eventId, userId) {

	const [row] = await sql`
		select ${EVENT_COLUMNS}, m.role
		from events e join event_members m on m.event_id = e.id
		where e.id = ${eventId} and m.user_id = ${userId}`;
	return row || null;
}

export async function listEventsForMember(userId) {

	return sql`
		select ${EVENT_COLUMNS}, m.role
		from events e join event_members m on m.event_id = e.id
		where m.user_id = ${userId}
		order by e.archived_at nulls first, e.updated_at desc`;
}

export async function updateEventName(db, eventId, name) {

	await db`update events set name = ${name}, updated_at = now() where id = ${eventId}`;
}

export async function updateEventAccent(eventId, accentColor) {

	await sql`update events set accent_color = ${accentColor}, updated_at = now() where id = ${eventId}`;
}

export async function updateEventCode(db, eventId, code) {

	await db`update events set code = ${code}, updated_at = now() where id = ${eventId}`;
}

export async function insertOldCode(db, { code, eventId }) {

	await db`insert into event_old_codes (code, event_id) values (${code}, ${eventId}) on conflict (code) do nothing`;
}

export async function deleteOldCode(db, { code, eventId }) {

	await db`delete from event_old_codes where code = ${code} and event_id = ${eventId}`;
}

export async function listOldCodes(eventId) {

	return (await sql`select code from event_old_codes where event_id = ${eventId} order by retired_at desc`).map((row) => row.code);
}

export async function setEventArchived(eventId, archived) {

	await sql`update events set archived_at = ${archived ? sql`now()` : null}, updated_at = now() where id = ${eventId}`;
}

export async function touchEvent(db, eventId) {

	await db`update events set updated_at = now() where id = ${eventId}`;
}
