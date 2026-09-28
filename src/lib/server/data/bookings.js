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

/* ---------- Organizer listing ---------- */

const LIST_WHEN = { upcoming: "upcoming", past: "past" };

/*
	One row per booking per booked date, with that date's Items grouped.
	filters: { when: all|upcoming|past, status: active|canceled, itemId, search, today, sortDirection: asc|desc, limit, offset }
*/
export async function listBookingDateRows(db, eventId, filters) {

	const search = filters.search ? `%${filters.search.replace(/[\\%_]/g, "\\$&")}%` : null;
	const direction = filters.sortDirection === "asc" ? db`asc` : db`desc`;
	const rows = await db`
		with grouped as (
			select b.id as booking_id, s.service_date, b.name, b.phone, b.contact_method, b.number_type, b.notes, b.status,
				json_agg(json_build_object('itemId', s.item_id, 'itemName', s.item_name, 'startTime', s.start_time, 'durationMinutes', s.duration_minutes)
					order by s.start_time nulls first, s.item_name) as selections,
				min(s.start_time) as first_start
			from calendar_bookings b join calendar_selections s on s.booking_id = b.id
			where b.event_id = ${eventId}
				and b.status = ${filters.status}
				and (${filters.when === LIST_WHEN.upcoming} = false or s.service_date >= ${filters.today})
				and (${filters.when === LIST_WHEN.past} = false or s.service_date < ${filters.today})
				and (${search}::text is null or b.name ilike ${search} or b.phone ilike ${search} or b.notes ilike ${search} or b.email ilike ${search})
			group by b.id, s.service_date
			having (${filters.itemId}::int is null or bool_or(s.item_id = ${filters.itemId}))
		)
		select *, count(*) over ()::int as total_count
		from grouped
		order by service_date ${direction}, first_start ${direction} nulls first, booking_id
		limit ${filters.limit} offset ${filters.offset}`;
	return rows;
}

export async function listBookingLog(db, bookingId) {

	return db`
		select l.action, l.detail, l.at, u.display_name as actor_name
		from calendar_booking_log l left join users u on u.id = l.actor_user_id
		where l.booking_id = ${bookingId}
		order by l.at desc, l.id desc`;
}

export async function updateBookingRegistrant(db, bookingId, registrant) {

	await db`
		update calendar_bookings set name = ${registrant.name}, phone = ${registrant.phone}, contact_method = ${registrant.contactMethod},
			number_type = ${registrant.numberType}, email = ${registrant.email}, notes = ${registrant.notes}, updated_at = now()
		where id = ${bookingId}`;
}

export async function deleteSelectionsByIds(db, selectionIds) {

	if (selectionIds.length) {
		await db`delete from calendar_selections where id = any(${selectionIds}::int[])`;
	}
}

export async function setBookingStatus(db, bookingId, status) {

	await db`
		update calendar_bookings set status = ${status}, canceled_at = ${status === "canceled" ? db`now()` : null}, updated_at = now()
		where id = ${bookingId}`;
}


/* ---------- Export ---------- */

// Every selection matching the filters, with its booking's fields (the service decides what leaves).
export async function listExportRows(db, eventId, filters) {

	return db`
		select s.id as selection_id, s.service_date, s.item_id, s.item_name, s.time_id, s.start_time, s.duration_minutes, s.time_label,
			b.id as booking_id, b.name, b.phone, b.contact_method, b.number_type, b.email, b.notes, b.status, b.created_at
		from calendar_selections s join calendar_bookings b on b.id = s.booking_id
		where s.event_id = ${eventId}
			and (${filters.includeCanceled} or b.status = 'active')
			and (${filters.fromDate}::date is null or s.service_date >= ${filters.fromDate})
			and (${filters.toDate}::date is null or s.service_date <= ${filters.toDate})
			and (${filters.itemIds.length === 0} or s.item_id = any(${filters.itemIds}::int[]))
			and (${filters.fromTime}::time is null or s.start_time >= ${filters.fromTime})
			and (${filters.toTime}::time is null or s.start_time < ${filters.toTime})
		order by s.service_date, s.start_time nulls first, s.item_name, b.name, s.id`;
}
