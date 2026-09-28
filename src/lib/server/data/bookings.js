/*
	Data access for bookings, their selections, and the booking log.
	`db` is the shared client or a transaction.
*/
import { normalizeTime } from "$lib/times.js";


export function mapBookingRow(row) {

	return {
		id: row.id,
		eventId: row.event_id,
		reference: row.confirmation_ref,
		status: row.status,
		name: row.name,
		phone: row.phone,
		contactMethod: row.contact_method,
		numberType: row.number_type,
		email: row.email,
		notes: row.notes,
		emailSentAt: row.email_sent_at,
		canceledAt: row.canceled_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

export function mapSelectionRow(row) {

	return {
		id: row.id,
		bookingId: row.booking_id,
		itemId: row.item_id,
		timeId: row.time_id,
		date: row.service_date,
		itemName: row.item_name,
		timeLabel: row.time_label,
		startTime: row.start_time ? normalizeTime(row.start_time) : null,
		durationMinutes: row.duration_minutes
	};
}

// Serializes bookings that compete for the same offerings (released at commit).
export async function lockOfferings(db, eventId, offeringKeys) {

	for (const key of [...new Set(offeringKeys)].sort()) {
		await db`select pg_advisory_xact_lock(${eventId}, hashtext(${key}))`;
	}
}

export async function findBookingByIdempotencyKey(db, eventId, idempotencyKey) {

	const [row] = await db`select * from calendar_bookings where event_id = ${eventId} and idempotency_key = ${idempotencyKey}`;
	return row ? mapBookingRow(row) : null;
}

export async function insertBooking(db, eventId, booking) {

	const [row] = await db`
		insert into calendar_bookings (event_id, confirmation_ref, idempotency_key, name, phone, contact_method, number_type, email, notes)
		values (${eventId}, ${booking.reference}, ${booking.idempotencyKey}, ${booking.name}, ${booking.phone}, ${booking.contactMethod},
			${booking.numberType}, ${booking.email}, ${booking.notes})
		returning *`;
	return mapBookingRow(row);
}

export async function insertSelection(db, eventId, bookingId, selection) {

	await db`
		insert into calendar_selections (event_id, booking_id, item_id, time_id, service_date, item_name, time_label, start_time, duration_minutes)
		values (${eventId}, ${bookingId}, ${selection.itemId}, ${selection.timeId}, ${selection.date}, ${selection.itemName},
			${selection.timeLabel}, ${selection.startTime}, ${selection.durationMinutes})`;
}

export async function deleteSelectionsForBooking(db, bookingId) {

	await db`delete from calendar_selections where booking_id = ${bookingId}`;
}

export async function insertBookingLog(db, eventId, bookingId, { actorUserId = null, action, detail = {} }) {

	await db`insert into calendar_booking_log (event_id, booking_id, actor_user_id, action, detail) values (${eventId}, ${bookingId}, ${actorUserId}, ${action}, ${db.json(detail)})`;
}

export async function findBookingByReference(db, eventId, reference) {

	const [row] = await db`select * from calendar_bookings where event_id = ${eventId} and confirmation_ref = ${reference}`;
	return row ? mapBookingRow(row) : null;
}

export async function findBookingById(db, eventId, bookingId) {

	const [row] = await db`select * from calendar_bookings where event_id = ${eventId} and id = ${bookingId}`;
	return row ? mapBookingRow(row) : null;
}

export async function listSelectionsForBooking(db, bookingId) {

	return (await db`select * from calendar_selections where booking_id = ${bookingId} order by service_date, start_time nulls first, id`).map(mapSelectionRow);
}

export async function markEmailSent(db, bookingId) {

	await db`update calendar_bookings set email_sent_at = now() where id = ${bookingId}`;
}
