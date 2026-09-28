/*
	Calendar setup rules. Updates are partial (autosave sends only what changed)
	but the merged result is validated as a whole before it's stored.
*/
import { checkHasErrors, fail, failInvalid, RESULT_CODE, succeed } from "$lib/result.js";
import { checkIsoDate, checkValidTimeZone } from "$lib/dates.js";
import { MIN_DAYS_AHEAD_MAX, ROLLING_LIMITS, ROLLING_UNIT, WINDOW_MODE } from "$lib/calendar/dateWindow.js";
import { DEFAULT_FORM_FIELDS, normalizeFormFields } from "$lib/calendar/formFields.js";
import { normalizeText } from "$lib/validation.js";
import { sql } from "../db.js";
import { countCalendarSummary, findConfig, insertConfig, updateConfigRow } from "../data/calendar.js";
import { touchEvent } from "../data/events.js";


export const CALENDAR_STATUS = { draft: "draft", open: "open", closed: "closed" };
export const ICS_MODE = { combined: "combined", separate: "separate" };
const DEFAULT_TIME_ZONE = "America/Denver";
const TITLE_MAX = 120;
const EDITABLE_KEYS = ["title", "status", "timeZone", "windowMode", "fixedStart", "fixedEnd", "rollingSize", "rollingUnit", "minDaysAhead", "timed", "preventOverlap", "formFields", "emailConfirmation", "icsEnabled", "icsMode"];


function validateConfig(config) {

	const errors = {};
	if (!config.title || config.title.length > TITLE_MAX) {
		errors.title = "Give the calendar a title (up to 120 characters).";
	}
	if (!Object.values(CALENDAR_STATUS).includes(config.status)) {
		errors.status = "Choose a status.";
	}
	if (!checkValidTimeZone(config.timeZone)) {
		errors.timeZone = "Choose a time zone from the list.";
	}
	if (config.windowMode === WINDOW_MODE.fixed) {
		if (!checkIsoDate(config.fixedStart)) {
			errors.fixedStart = "Choose a start date.";
		}
		if (!checkIsoDate(config.fixedEnd)) {
			errors.fixedEnd = "Choose an end date.";
		}
		else if (checkIsoDate(config.fixedStart) && config.fixedEnd < config.fixedStart) {
			errors.fixedEnd = "The end date must be on or after the start date.";
		}
	}
	else if (config.windowMode === WINDOW_MODE.rolling) {
		const limits = ROLLING_LIMITS[config.rollingUnit];
		if (!limits) {
			errors.rollingUnit = "Choose days, weeks, or months.";
		}
		else if (!Number.isInteger(config.rollingSize) || config.rollingSize < limits.min || config.rollingSize > limits.max) {
			errors.rollingSize = `Use a number from ${limits.min} to ${limits.max}.`;
		}
	}
	else {
		errors.windowMode = "Choose fixed dates or a rolling window.";
	}
	if (!Number.isInteger(config.minDaysAhead) || config.minDaysAhead < 0 || config.minDaysAhead > MIN_DAYS_AHEAD_MAX) {
		errors.minDaysAhead = `Use a number from 0 to ${MIN_DAYS_AHEAD_MAX}.`;
	}
	if (!Object.values(ICS_MODE).includes(config.icsMode)) {
		errors.icsMode = "Choose a calendar file style.";
	}
	return errors;
}

function mergeConfig(current, changes) {

	const merged = { ...current };
	for (const key of EDITABLE_KEYS) {
		if (changes[key] !== undefined) {
			merged[key] = changes[key];
		}
	}
	merged.title = normalizeText(merged.title);
	merged.rollingSize = Number(merged.rollingSize);
	merged.minDaysAhead = Number(merged.minDaysAhead);
	merged.fixedStart = merged.fixedStart || null;
	merged.fixedEnd = merged.fixedEnd || null;
	merged.timed = Boolean(merged.timed);
	merged.preventOverlap = Boolean(merged.preventOverlap);
	merged.icsEnabled = Boolean(merged.icsEnabled);
	merged.formFields = normalizeFormFields(merged.formFields);
	// Email confirmations need the email field (they stay visible but disabled in setup).
	merged.emailConfirmation = Boolean(merged.emailConfirmation) && merged.formFields.email.on;
	return merged;
}


export async function loadCalendarConfig(eventId) {

	return findConfig(sql, eventId);
}

export async function createCalendar(eventId, { timeZone }) {

	const existing = await findConfig(sql, eventId);
	if (existing) {
		return succeed(existing);
	}
	const config = await insertConfig(sql, eventId, {
		title: "Sign up",
		timeZone: checkValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE,
		formFields: DEFAULT_FORM_FIELDS
	});
	await touchEvent(sql, eventId);
	return succeed(config);
}

export async function updateCalendarConfig(eventId, changes) {

	const current = await findConfig(sql, eventId);
	if (!current) {
		return fail(RESULT_CODE.notFound, "This event has no calendar yet.");
	}
	const merged = mergeConfig(current, changes || {});
	const errors = validateConfig(merged);
	if (checkHasErrors(errors)) {
		return failInvalid(errors);
	}
	const saved = await updateConfigRow(sql, eventId, merged);
	await touchEvent(sql, eventId);
	return succeed(saved);
}

export const ROLLING_UNITS = Object.values(ROLLING_UNIT);

export async function loadCalendarNavCounts(eventId) {

	return countCalendarSummary(sql, eventId);
}
