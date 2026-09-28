/*
	Item rules: name, capacity, identity (color + shape), and times for timed
	calendars. Items are archived, never deleted. Removed times are archived too,
	so bookings that reference them stay readable.
*/
import { checkHasErrors, fail, failInvalid, RESULT_CODE, succeed } from "$lib/result.js";
import { checkIsoDate, todayInTimeZone } from "$lib/dates.js";
import { checkValidIdentity, GLYPH_SHAPE, pickDefaultIdentity } from "$lib/calendar/palette.js";
import { convertTimeToMinutes, MINUTES_PER_DAY, normalizeTime } from "$lib/times.js";
import { LIMITS, normalizeText } from "$lib/validation.js";
import { sql } from "../db.js";
import { archiveTimesExcept, countItemsEver, countUpcomingSelectionsByItem, findConfig, findItemRow, insertItemRow, insertTimeRow, listItemRows, listTimeRows, setItemArchived, setItemSortOrder, updateItemRow, updateTimeRow } from "../data/calendar.js";
import { touchEvent } from "../data/events.js";


export const CAPACITY_MAX = 10000;
const DURATION_MIN = 5;
const TIME_LABEL_MAX = 80;
const TIMES_PER_ITEM_MAX = 48;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;


function validateTimes(rawTimes) {

	const errors = {};
	const times = (Array.isArray(rawTimes) ? rawTimes : []).slice(0, TIMES_PER_ITEM_MAX).map((raw, index) => {
		const time = {
			id: Number.isInteger(raw?.id) ? raw.id : null,
			startTime: normalizeTime(raw?.startTime || ""),
			durationMinutes: Number(raw?.durationMinutes),
			label: normalizeText(raw?.label).slice(0, TIME_LABEL_MAX),
			capacityOverride: raw?.capacityOverride === null || raw?.capacityOverride === "" || raw?.capacityOverride === undefined ? null : Number(raw.capacityOverride),
			onlyDate: raw?.onlyDate || null
		};
		if (!TIME_PATTERN.test(time.startTime)) {
			errors[`times.${index}.startTime`] = "Enter a start time.";
		}
		else if (!Number.isInteger(time.durationMinutes) || time.durationMinutes < DURATION_MIN) {
			errors[`times.${index}.durationMinutes`] = `Use at least ${DURATION_MIN} minutes.`;
		}
		else if (convertTimeToMinutes(time.startTime) + time.durationMinutes > MINUTES_PER_DAY) {
			errors[`times.${index}.durationMinutes`] = "Times can't run past midnight.";
		}
		if (time.capacityOverride !== null && (!Number.isInteger(time.capacityOverride) || time.capacityOverride < 1 || time.capacityOverride > CAPACITY_MAX)) {
			errors[`times.${index}.capacityOverride`] = `Use 1 to ${CAPACITY_MAX}, or leave it empty.`;
		}
		if (time.onlyDate && !checkIsoDate(time.onlyDate)) {
			errors[`times.${index}.onlyDate`] = "Choose a date, or leave it for every day.";
		}
		return time;
	});
	return { times, errors };
}

function validateItem(input) {

	const item = {
		name: normalizeText(input.name),
		capacity: Number(input.capacity),
		color: input.color,
		shape: input.shape,
		glyph: input.shape === GLYPH_SHAPE ? String(input.glyph || "").toUpperCase() : null
	};
	const errors = {};
	if (!item.name || item.name.length > LIMITS.itemNameMax) {
		errors.name = "Give the Item a name.";
	}
	if (!Number.isInteger(item.capacity) || item.capacity < 1 || item.capacity > CAPACITY_MAX) {
		errors.capacity = `Use 1 to ${CAPACITY_MAX}.`;
	}
	if (!checkValidIdentity(item)) {
		errors.shape = "Choose a color and a shape (or a letter or number).";
	}
	const { times, errors: timeErrors } = validateTimes(input.times);
	return { item, times, errors: { ...errors, ...timeErrors } };
}


export async function listCalendarItems(eventId) {

	const config = await findConfig(sql, eventId);
	const today = todayInTimeZone(config?.timeZone || "UTC");
	const [items, times, upcoming] = await Promise.all([
		listItemRows(sql, eventId),
		listTimeRows(sql, eventId),
		countUpcomingSelectionsByItem(sql, eventId, today)
	]);
	return items.map((item) => ({
		...item,
		times: times.filter((time) => time.itemId === item.id),
		upcomingCount: upcoming.get(item.id) || 0
	}));
}

export async function suggestNewItemIdentity(eventId) {

	const { count } = await countItemsEver(sql, eventId);
	return pickDefaultIdentity(count);
}

export async function saveCalendarItem(eventId, itemId, input) {

	const { item, times, errors } = validateItem(input || {});
	if (checkHasErrors(errors)) {
		return failInvalid(errors);
	}
	return sql.begin(async (tx) => {
		let saved;
		if (itemId) {
			saved = await updateItemRow(tx, eventId, itemId, item);
			if (!saved) {
				return fail(RESULT_CODE.notFound, "That Item no longer exists.");
			}
		}
		else {
			const { max_order: maxOrder } = await countItemsEver(tx, eventId);
			saved = await insertItemRow(tx, eventId, { ...item, sortOrder: maxOrder + 1 });
		}
		const keepIds = times.filter((time) => time.id).map((time) => time.id);
		await archiveTimesExcept(tx, eventId, saved.id, keepIds);
		for (const time of times) {
			if (time.id) {
				await updateTimeRow(tx, eventId, saved.id, time);
			}
			else {
				await insertTimeRow(tx, eventId, saved.id, time);
			}
		}
		await touchEvent(tx, eventId);
		return succeed(saved);
	});
}

export async function archiveCalendarItem(eventId, itemId, archived) {

	const item = await findItemRow(sql, eventId, itemId);
	if (!item) {
		return fail(RESULT_CODE.notFound, "That Item no longer exists.");
	}
	await setItemArchived(sql, eventId, itemId, archived);
	return succeed();
}

// Moves an active Item up (-1) or down (+1) in the list.
export async function moveCalendarItem(eventId, itemId, direction) {

	return sql.begin(async (tx) => {
		const active = (await listItemRows(tx, eventId)).filter((item) => !item.archived);
		const index = active.findIndex((item) => item.id === itemId);
		const target = index + direction;
		if (index < 0 || target < 0 || target >= active.length) {
			return succeed();
		}
		const reordered = [...active];
		[reordered[index], reordered[target]] = [reordered[target], reordered[index]];
		for (const [order, item] of reordered.entries()) {
			await setItemSortOrder(tx, eventId, item.id, order);
		}
		return succeed();
	});
}

// Colors and shapes for every Item (archived too), for showing past bookings.
export async function loadItemIdentities(eventId) {

	const items = await listItemRows(sql, eventId);
	return Object.fromEntries(items.map((item) => [item.id, { name: item.name, color: item.color, shape: item.shape, glyph: item.glyph }]));
}
