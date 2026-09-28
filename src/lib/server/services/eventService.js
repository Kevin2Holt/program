/*
	Event rules: creation with an owner, custom codes (shape, reserved words, and
	one namespace shared by current and retired codes), code changes that keep
	the old code redirecting, archiving, and public code resolution.
*/
import { checkHasErrors, fail, failInvalid, RESULT_CODE, succeed } from "$lib/result.js";
import { normalizeEventCode, normalizeText, validateEventCodeShape, validateEventName } from "$lib/validation.js";
import { PG_ERROR, sql } from "../db.js";
import { checkReservedWord, deleteOldCode, findEventById, findEventByCode, findEventIdUsingCode, findMembership, insertEvent, insertEventMember, insertOldCode, listEventsForMember, listOldCodes, setEventArchived, updateEventCode, updateEventName } from "../data/events.js";
import { ROLE } from "./permissionService.js";


const CODE_TAKEN_MESSAGE = "That link is taken. Try another.";


// Checks whether code can be used by the given event (or a new event when exceptEventId is null).
export async function checkCodeAvailability(rawCode, exceptEventId = null) {

	const code = normalizeEventCode(rawCode);
	const shapeError = validateEventCodeShape(code);
	if (shapeError) {
		return { code, available: false, message: shapeError };
	}
	if (await checkReservedWord(code)) {
		return { code, available: false, message: `"${code}" is reserved. Try another link.` };
	}
	const owner = await findEventIdUsingCode(code);
	if (owner && owner.eventId !== exceptEventId) {
		return { code, available: false, message: CODE_TAKEN_MESSAGE };
	}
	return { code, available: true, message: "" };
}

export async function createEvent(userId, input) {

	const name = normalizeText(input.name);
	const errors = {};
	const nameError = validateEventName(name);
	if (nameError) {
		errors.name = nameError;
	}
	const codeCheck = await checkCodeAvailability(input.code);
	if (!codeCheck.available) {
		errors.code = codeCheck.message;
	}
	if (checkHasErrors(errors)) {
		return failInvalid(errors);
	}

	try {
		const event = await sql.begin(async (tx) => {
			const created = await insertEvent(tx, { name, code: codeCheck.code, createdBy: userId });
			await insertEventMember(tx, { eventId: created.id, userId, role: ROLE.owner });
			return created;
		});
		return succeed(event);
	}
	catch (err) {
		if (err.code === PG_ERROR.uniqueViolation) {
			return failInvalid({ code: CODE_TAKEN_MESSAGE });
		}
		throw err;
	}
}

export async function updateEventSettings(eventId, input) {

	const event = await findEventById(eventId);
	if (!event) {
		return fail(RESULT_CODE.notFound, "Event not found.");
	}
	const name = normalizeText(input.name);
	const code = normalizeEventCode(input.code);
	const errors = {};
	const nameError = validateEventName(name);
	if (nameError) {
		errors.name = nameError;
	}
	if (code !== event.code) {
		const codeCheck = await checkCodeAvailability(code, eventId);
		if (!codeCheck.available) {
			errors.code = codeCheck.message;
		}
	}
	if (checkHasErrors(errors)) {
		return failInvalid(errors);
	}

	try {
		await sql.begin(async (tx) => {
			await updateEventName(tx, eventId, name);
			if (code !== event.code) {
				// Reclaiming one of this event's own old codes removes it from the history.
				await deleteOldCode(tx, { code, eventId });
				await updateEventCode(tx, eventId, code);
				await insertOldCode(tx, { code: event.code, eventId });
			}
		});
	}
	catch (err) {
		if (err.code === PG_ERROR.uniqueViolation) {
			return failInvalid({ code: CODE_TAKEN_MESSAGE });
		}
		throw err;
	}
	return succeed({ ...event, name, code, codeChanged: code !== event.code });
}

export async function archiveEvent(eventId, archived) {

	await setEventArchived(eventId, archived);
	return succeed();
}

export async function loadMembership(eventId, userId) {

	return findMembership(eventId, userId);
}

export async function listMemberEvents(userId) {

	return listEventsForMember(userId);
}

export async function listEventOldCodes(eventId) {

	return listOldCodes(eventId);
}

/*
	Resolves a public code. Returns one of (reference key PUBLIC_EVENT_RESOLUTION):
	{ event }            current code of a live event
	{ redirectCode }     a retired code; redirect to the event's current code
	null                 unknown code or archived event (render not found)
*/
export async function resolvePublicEvent(rawCode) {

	const code = normalizeEventCode(rawCode);
	const match = await findEventIdUsingCode(code);
	if (!match) {
		return null;
	}
	if (!match.isCurrent) {
		const event = await findEventById(match.eventId);
		return event && !event.archived_at ? { redirectCode: event.code } : null;
	}
	const event = await findEventByCode(code);
	return event.archived_at ? null : { event };
}
