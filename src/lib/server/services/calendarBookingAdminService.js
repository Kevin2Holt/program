/*
	Organizer booking management: the bookings table, details with the activity
	log, edits and reschedules, cancel, and restore.

	Edits use the same evaluation as public bookings (evaluateSelections):
	unchanged selections are exempt, new ones must pass rules, capacity, and
	overlap. Organizers aren't limited to the signup window (they may fix past
	records or book ahead), but a full, blocked, archived, or overlapping target
	is refused with the reason.
*/
import { checkHasErrors, fail, failInvalid, RESULT_CODE, succeed } from "$lib/result.js";
import { formatDateShort, todayInTimeZone } from "$lib/dates.js";
import { formatTime12, normalizeTime } from "$lib/times.js";
import { buildOfferingKey } from "$lib/calendar/capacity.js";
import { LIMITS, normalizeEmail, normalizeText, validateEmail, validatePhone } from "$lib/validation.js";
import { sql } from "../db.js";
import { deleteSelectionsByIds, findBookingById, insertBookingLog, insertSelection, listBookingDateRows, listBookingLog, listSelectionsForBooking, lockOfferings, setBookingStatus, updateBookingRegistrant } from "../data/bookings.js";
import { findConfig } from "../data/calendar.js";
import { loadCalendarContext } from "./calendarAvailabilityService.js";
import { evaluateSelections, normalizeSelections } from "./calendarBookingService.js";


export const BOOKINGS_PAGE_SIZE = 50;
const ORGANIZER_WINDOW = { start: "0001-01-01", end: "9999-12-31", firstBookable: "0001-01-01" };
const BOOKING_STATUS = { active: "active", canceled: "canceled" };
const WHEN_FILTERS = ["all", "upcoming", "past"];


function describeSelectionShort(selection) {

	return `${selection.itemName}, ${formatDateShort(selection.date)}${selection.startTime ? ` ${formatTime12(selection.startTime)}` : ""}`;
}


export async function listBookingsPage(eventId, query) {

	const config = await findConfig(sql, eventId);
	const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
	const filters = {
		when: WHEN_FILTERS.includes(query.when) ? query.when : "all",
		status: query.when === "canceled" ? BOOKING_STATUS.canceled : BOOKING_STATUS.active,
		itemId: Number.parseInt(query.item, 10) || null,
		search: normalizeText(query.q).slice(0, LIMITS.personNameMax) || null,
		today: todayInTimeZone(config?.timeZone || "UTC"),
		sortDirection: query.sort === "asc" ? "asc" : "desc",
		limit: BOOKINGS_PAGE_SIZE,
		offset: (page - 1) * BOOKINGS_PAGE_SIZE
	};
	const rows = await listBookingDateRows(sql, eventId, filters);
	return {
		page,
		total: rows[0]?.total_count || 0,
		rows: rows.map((row) => ({
			bookingId: row.booking_id,
			date: row.service_date,
			name: row.name,
			phone: row.phone,
			contactMethod: row.contact_method,
			numberType: row.number_type,
			hasNotes: Boolean(row.notes),
			selections: row.selections.map((selection) => ({ ...selection, startTime: selection.startTime ? normalizeTime(selection.startTime) : null }))
		}))
	};
}

export async function loadBookingDetails(eventId, bookingId) {

	const booking = await findBookingById(sql, eventId, bookingId);
	if (!booking) {
		return null;
	}
	const [selections, log] = await Promise.all([listSelectionsForBooking(sql, booking.id), listBookingLog(sql, booking.id)]);
	return {
		booking,
		selections,
		log: log.map((entry) => ({ action: entry.action, detail: entry.detail, at: entry.at, actorName: entry.actor_name }))
	};
}

function validateOrganizerRegistrant(input) {

	// Organizers may leave optional details empty, but what they enter must be valid.
	const registrant = {
		name: normalizeText(input.name).slice(0, LIMITS.personNameMax),
		phone: normalizeText(input.phone),
		contactMethod: ["call", "text"].includes(input.contactMethod) ? input.contactMethod : null,
		numberType: ["cell", "whatsapp"].includes(input.numberType) ? input.numberType : null,
		email: normalizeEmail(input.email),
		notes: normalizeText(input.notes).slice(0, LIMITS.notesMax)
	};
	const errors = {};
	if (!registrant.name) {
		errors.name = "Enter a name.";
	}
	if (registrant.phone && validatePhone(registrant.phone)) {
		errors.phone = validatePhone(registrant.phone);
	}
	if (registrant.email && validateEmail(registrant.email)) {
		errors.email = validateEmail(registrant.email);
	}
	return { registrant, errors };
}

/*
	input: { registrant fields, selections: [{ itemId, date, timeId }] }.
	Conflicts: errors.selections = per-selection results (same shape as public).
*/
export async function updateBooking(eventId, bookingId, input, actorUserId) {

	const { registrant, errors } = validateOrganizerRegistrant(input);
	const requested = normalizeSelections(input.selections);
	if (!requested.length) {
		errors.selections = "Keep at least one signup, or cancel the booking instead.";
	}
	if (checkHasErrors(errors)) {
		return failInvalid(errors);
	}

	return sql.begin(async (tx) => {
		const booking = await findBookingById(tx, eventId, bookingId);
		if (!booking) {
			return fail(RESULT_CODE.notFound, "That booking no longer exists.");
		}
		const existing = await listSelectionsForBooking(tx, booking.id);
		const existingByKey = new Map(existing.map((selection) => [buildOfferingKey(selection.itemId, selection.date, selection.timeId), selection]));
		const requestedKeys = requested.map((selection) => buildOfferingKey(selection.itemId, selection.date, selection.timeId));
		await lockOfferings(tx, eventId, [...requestedKeys, ...existingByKey.keys()]);

		const context = await loadCalendarContext(eventId, tx);
		const exemptKeys = new Set(requestedKeys.filter((key) => existingByKey.has(key)));
		const results = await evaluateSelections(tx, context, requested, { window: ORGANIZER_WINDOW, excludeBookingId: booking.id, exemptKeys });
		if (results.some((result) => !result.ok)) {
			return fail(RESULT_CODE.conflict, "Some changes can't be made.", {
				selections: results.map((result, index) => ({ index, ok: result.ok, reason: result.reason, message: result.message }))
			});
		}

		const removed = existing.filter((selection) => !requestedKeys.includes(buildOfferingKey(selection.itemId, selection.date, selection.timeId)));
		const added = results.filter((result) => !existingByKey.has(result.key)).map((result) => result.snapshot);
		await deleteSelectionsByIds(tx, removed.map((selection) => selection.id));
		for (const snapshot of added) {
			await insertSelection(tx, eventId, booking.id, snapshot);
		}
		await updateBookingRegistrant(tx, booking.id, registrant);

		const changedFields = ["name", "phone", "contactMethod", "numberType", "email", "notes"].filter((field) => (booking[field] || "") !== (registrant[field] || ""));
		if (added.length || removed.length || changedFields.length) {
			await insertBookingLog(tx, eventId, booking.id, {
				actorUserId,
				action: "edited",
				detail: { added: added.map(describeSelectionShort), removed: removed.map(describeSelectionShort), fields: changedFields }
			});
		}
		return succeed({ bookingId: booking.id });
	});
}

export async function cancelBooking(eventId, bookingId, actorUserId) {

	return sql.begin(async (tx) => {
		const booking = await findBookingById(tx, eventId, bookingId);
		if (!booking) {
			return fail(RESULT_CODE.notFound, "That booking no longer exists.");
		}
		if (booking.status === BOOKING_STATUS.canceled) {
			return succeed();
		}
		await setBookingStatus(tx, booking.id, BOOKING_STATUS.canceled);
		await insertBookingLog(tx, eventId, booking.id, { actorUserId, action: "canceled" });
		return succeed();
	});
}

// Reactivates a canceled booking, only if every selection still has room.
export async function restoreBooking(eventId, bookingId, actorUserId) {

	return sql.begin(async (tx) => {
		const booking = await findBookingById(tx, eventId, bookingId);
		if (!booking) {
			return fail(RESULT_CODE.notFound, "That booking no longer exists.");
		}
		if (booking.status === BOOKING_STATUS.active) {
			return succeed();
		}
		const selections = await listSelectionsForBooking(tx, booking.id);
		await lockOfferings(tx, eventId, selections.map((selection) => buildOfferingKey(selection.itemId, selection.date, selection.timeId)));
		const context = await loadCalendarContext(eventId, tx);
		const results = await evaluateSelections(tx, context, selections, { window: ORGANIZER_WINDOW, excludeBookingId: booking.id });
		const failed = results.map((result, index) => ({ result, selection: selections[index] })).filter((entry) => !entry.result.ok);
		if (failed.length) {
			return fail(RESULT_CODE.conflict, `Can't restore: ${failed.map((entry) => `${describeSelectionShort(entry.selection)} (${entry.result.message.replace(/\.$/, "").toLowerCase()})`).join("; ")}.`);
		}
		await setBookingStatus(tx, booking.id, BOOKING_STATUS.active);
		await insertBookingLog(tx, eventId, booking.id, { actorUserId, action: "restored" });
		return succeed();
	});
}
