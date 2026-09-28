/*
	Booking rules. A submission is revalidated in one transaction:
	  1. validate the signup form fields (before any locking)
	  2. lock every requested offering (advisory locks, sorted: no deadlocks)
	  3. return the existing booking if this idempotency key was already used
	  4. re-resolve every selection against current Items, times, rules, window,
	     and capacity (from stored selections), and check timed overlaps
	  5. insert the booking and its snapshotted selections, or report which
	     selections failed so the page can keep the rest
	Emails go out after commit; a mail failure never fails a booking.
*/
import crypto from "node:crypto";
import { checkHasErrors, fail, failInvalid, RESULT_CODE, succeed } from "$lib/result.js";
import { checkIsoDate, formatDateFull, todayInTimeZone } from "$lib/dates.js";
import { formatTime12 } from "$lib/times.js";
import { deriveDateWindow } from "$lib/calendar/dateWindow.js";
import { listItemTimesOnDate, resolveDate, STATUS } from "$lib/calendar/availability.js";
import { buildOfferingKey, buildUsageMap } from "$lib/calendar/capacity.js";
import { findOverlappingPairs } from "$lib/calendar/overlap.js";
import { LIMITS, normalizeEmail, normalizeText, validateEmail, validatePhone } from "$lib/validation.js";
import { PG_ERROR, sql } from "../db.js";
import { listUsageRows } from "../data/calendar.js";
import { findBookingByIdempotencyKey, findBookingByReference, insertBooking, insertBookingLog, insertSelection, listSelectionsForBooking, lockOfferings, markEmailSent } from "../data/bookings.js";
import { sendMail } from "../mail/mailer.js";
import { buildPublicUrl } from "../publicUrl.js";
import { loadCalendarContext } from "./calendarAvailabilityService.js";
import { CALENDAR_STATUS } from "./calendarConfigService.js";


const REFERENCE_BYTES = 32;	// 256 bits of randomness
const SELECTIONS_MAX = 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTACT_METHODS = ["call", "text"];
const NUMBER_TYPES = ["cell", "whatsapp"];

// Why a selection failed (reference key SELECTION_REASON).
export const SELECTION_REASON = {
	invalid: "invalid",	// not offered at all (unknown Item/time, wrong date)
	duplicate: "duplicate",	// the same offering twice in one submission
	taken: "taken",	// full: someone else took the last spot
	closed: "closed",	// blocked, archived, or outside the window
	overlap: "overlap"	// overlaps another timed selection that day
};


/* ---------- Input normalization ---------- */

export function normalizeSelections(rawSelections) {

	return (Array.isArray(rawSelections) ? rawSelections : []).slice(0, SELECTIONS_MAX).map((raw) => ({
		itemId: Number(raw?.itemId),
		date: String(raw?.date || ""),
		timeId: raw?.timeId === null || raw?.timeId === undefined || raw?.timeId === "" ? null : Number(raw.timeId)
	}));
}

export function validateRegistrant(formFields, input) {

	const registrant = {
		name: normalizeText(input.name).slice(0, LIMITS.personNameMax),
		phone: formFields.phone.on ? normalizeText(input.phone) : "",
		contactMethod: formFields.contactMethod.on && CONTACT_METHODS.includes(input.contactMethod) ? input.contactMethod : null,
		numberType: formFields.numberType.on && NUMBER_TYPES.includes(input.numberType) ? input.numberType : null,
		email: formFields.email.on ? normalizeEmail(input.email) : "",
		notes: formFields.notes.on ? normalizeText(input.notes) : ""
	};
	const errors = {};
	if (!registrant.name) {
		errors.name = "Enter your name.";
	}
	if (formFields.phone.on && (registrant.phone || formFields.phone.required)) {
		const phoneError = registrant.phone ? validatePhone(registrant.phone) : "Enter your phone number.";
		if (phoneError) {
			errors.phone = phoneError;
		}
	}
	if (formFields.contactMethod.required && !registrant.contactMethod) {
		errors.contactMethod = "Choose call or text.";
	}
	if (formFields.numberType.required && !registrant.numberType) {
		errors.numberType = "Choose cell or WhatsApp.";
	}
	if (formFields.email.on && (registrant.email || formFields.email.required)) {
		const emailError = validateEmail(registrant.email);
		if (emailError) {
			errors.email = emailError;
		}
	}
	if (formFields.notes.required && !registrant.notes) {
		errors.notes = "Add a note.";
	}
	if (registrant.notes.length > LIMITS.notesMax) {
		errors.notes = `Keep notes under ${LIMITS.notesMax} characters.`;
	}
	return { registrant, errors };
}


/* ---------- Selection evaluation (shared with organizer edits) ---------- */

function describeFailure(reason, conflictWith) {

	switch (reason) {
		case SELECTION_REASON.taken:
			return "Someone else just took this spot.";
		case SELECTION_REASON.closed:
			return "This isn't available anymore.";
		case SELECTION_REASON.overlap:
			return `Overlaps your ${formatTime12(conflictWith.startTime)} selection that day.`;
		case SELECTION_REASON.duplicate:
			return "You already selected this.";
		default:
			return "This isn't offered.";
	}
}

/*
	Checks each selection against the current state. Returns per-selection
	{ ok, reason, message, snapshot } where snapshot carries the names and times
	stored with the booking. Options:
	  window            the window to enforce
	  excludeBookingId  ignore this booking's own usage (organizer edits)
	  exemptKeys        offering keys left unchanged by an organizer edit
*/
export async function evaluateSelections(db, context, selections, { window, excludeBookingId = null, exemptKeys = new Set() }) {

	const itemsById = new Map(context.items.map((item) => [item.id, item]));
	const timesById = new Map(context.times.map((time) => [time.id, time]));
	const seen = new Set();
	const results = selections.map((selection) => {
		const item = itemsById.get(selection.itemId);
		if (!item || !checkIsoDate(selection.date)) {
			return { ok: false, reason: SELECTION_REASON.invalid };
		}
		const offeredTimes = context.config.timed ? listItemTimesOnDate(context.times, item.id, selection.date) : [];
		const time = selection.timeId ? timesById.get(selection.timeId) : null;
		if (offeredTimes.length ? !time || !offeredTimes.some((offered) => offered.id === time.id) : selection.timeId !== null) {
			// A time that was archived stays valid only for an unchanged organizer edit.
			const exemptTime = time && time.itemId === item.id && exemptKeys.has(buildOfferingKey(item.id, selection.date, time.id));
			if (!exemptTime) {
				return { ok: false, reason: SELECTION_REASON.invalid };
			}
		}
		const key = buildOfferingKey(item.id, selection.date, time?.id || null);
		if (seen.has(key)) {
			return { ok: false, reason: SELECTION_REASON.duplicate };
		}
		seen.add(key);
		return {
			ok: true,
			reason: null,
			key,
			snapshot: {
				itemId: item.id,
				timeId: time?.id || null,
				date: selection.date,
				itemName: item.name,
				timeLabel: time?.label || "",
				startTime: time?.startTime || null,
				durationMinutes: time?.durationMinutes || null
			}
		};
	});

	const valid = results.filter((result) => result.ok);
	if (valid.length) {
		const dates = valid.map((result) => result.snapshot.date).sort();
		const usage = buildUsageMap(await listUsageRows(db, context.config.eventId, dates[0], dates.at(-1), excludeBookingId));
		const resolvedByDate = new Map();
		for (const date of new Set(dates)) {
			const resolved = resolveDate({ date, items: context.items, times: context.times, rules: context.rules, window, usage, timed: context.config.timed });
			resolvedByDate.set(date, new Map(resolved.map((entry) => [entry.itemId, entry])));
		}
		for (const result of valid) {
			if (exemptKeys.has(result.key)) {
				continue;
			}
			const entry = resolvedByDate.get(result.snapshot.date).get(result.snapshot.itemId);
			const status = result.snapshot.timeId
				? entry.occurrences.find((occurrence) => occurrence.timeId === result.snapshot.timeId)?.status
				: entry.status;
			if (status !== STATUS.available) {
				result.ok = false;
				result.reason = status === STATUS.full ? SELECTION_REASON.taken : SELECTION_REASON.closed;
			}
		}
	}

	if (context.config.timed && context.config.preventOverlap) {
		const timed = results.filter((result) => result.ok && result.snapshot.startTime);
		for (const [first, second] of findOverlappingPairs(timed.map((result) => result.snapshot))) {
			if (timed[first].ok) {
				timed[second].ok = false;
				timed[second].reason = SELECTION_REASON.overlap;
				timed[second].conflictWith = timed[first].snapshot;
			}
		}
	}

	return results.map((result) => ({ ...result, message: result.ok ? "" : describeFailure(result.reason, result.conflictWith) }));
}


/* ---------- Public booking ---------- */

function createReference() {

	return crypto.randomBytes(REFERENCE_BYTES).toString("base64url");
}

export function buildConfirmationUrl(eventCode, reference) {

	return buildPublicUrl(`/${eventCode}/calendar/confirmation/${reference}`);
}

function describeSelectionForEmail(selection) {

	const when = selection.startTime ? `${formatDateFull(selection.date)}, ${formatTime12(selection.startTime)}` : formatDateFull(selection.date);
	return `- ${selection.itemName}: ${when}${selection.timeLabel ? ` (${selection.timeLabel})` : ""}`;
}

async function sendConfirmationEmail({ event, config, booking, selections }) {

	const url = buildConfirmationUrl(event.code, booking.reference);
	const sent = await sendMail({
		to: booking.email,
		subject: `You're signed up: ${config.title} · ${event.name}`,
		text: [`Hi ${booking.name},`, "", `You're signed up for ${event.name}:`, ...selections.map(describeSelectionForEmail), "", `See your signup any time: ${url}`].join("\n")
	});
	if (sent) {
		await markEmailSent(sql, booking.id);
	}
	return sent;
}

/*
	event: { id, code, name }. input: { selections, registrant fields, idempotencyKey }.
	Success: { reference, duplicate }. Conflict: errors.selections = per-selection results.
*/
export async function createBooking(event, input, { now = new Date() } = {}) {

	const selections = normalizeSelections(input.selections);
	if (!selections.length) {
		return failInvalid({ selections: "Pick at least one thing to sign up for." });
	}
	if (!UUID_PATTERN.test(String(input.idempotencyKey || ""))) {
		return failInvalid({ form: "This form expired. Reload the page and try again." });
	}

	const preliminary = await loadCalendarContext(event.id);
	if (!preliminary || preliminary.config.status !== CALENDAR_STATUS.open) {
		return fail(RESULT_CODE.conflict, "Signups are closed for this calendar.");
	}
	const { registrant, errors } = validateRegistrant(preliminary.config.formFields, input);
	if (checkHasErrors(errors)) {
		return failInvalid(errors);
	}

	let outcome;
	try {
		outcome = await sql.begin(async (tx) => {
			await lockOfferings(tx, event.id, selections.map((selection) => buildOfferingKey(selection.itemId, selection.date, selection.timeId)));
			const existing = await findBookingByIdempotencyKey(tx, event.id, input.idempotencyKey);
			if (existing) {
				return succeed({ reference: existing.reference, duplicate: true });
			}

			const context = await loadCalendarContext(event.id, tx);
			if (context.config.status !== CALENDAR_STATUS.open) {
				return fail(RESULT_CODE.conflict, "Signups are closed for this calendar.");
			}
			const window = deriveDateWindow(context.config, todayInTimeZone(context.config.timeZone, now));
			const results = await evaluateSelections(tx, context, selections, { window });
			if (results.some((result) => !result.ok)) {
				return fail(RESULT_CODE.conflict, "Some of your selections aren't available anymore.", {
					selections: results.map((result, index) => ({ index, ok: result.ok, reason: result.reason, message: result.message }))
				});
			}

			const booking = await insertBooking(tx, event.id, { ...registrant, reference: createReference(), idempotencyKey: input.idempotencyKey });
			for (const result of results) {
				await insertSelection(tx, event.id, booking.id, result.snapshot);
			}
			await insertBookingLog(tx, event.id, booking.id, { action: "created", detail: { selections: results.length } });
			return succeed({ reference: booking.reference, duplicate: false, booking, config: context.config, selections: results.map((result) => result.snapshot) });
		});
	}
	catch (err) {
		// Two identical submissions that raced past the lock: the unique key decides.
		if (err.code === PG_ERROR.uniqueViolation) {
			const existing = await findBookingByIdempotencyKey(sql, event.id, input.idempotencyKey);
			if (existing) {
				return succeed({ reference: existing.reference, duplicate: true });
			}
		}
		throw err;
	}

	if (outcome.ok && !outcome.value.duplicate && outcome.value.config.emailConfirmation && outcome.value.booking.email) {
		await sendConfirmationEmail({ event, config: outcome.value.config, booking: outcome.value.booking, selections: outcome.value.selections });
	}
	return outcome.ok ? succeed({ reference: outcome.value.reference, duplicate: outcome.value.duplicate }) : outcome;
}

export async function loadConfirmation(eventId, reference) {

	if (typeof reference !== "string" || reference.length < REFERENCE_BYTES) {
		return null;
	}
	const booking = await findBookingByReference(sql, eventId, reference);
	if (!booking) {
		return null;
	}
	return { booking, selections: await listSelectionsForBooking(sql, booking.id) };
}
