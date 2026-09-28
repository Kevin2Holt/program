/*
	Calendar-date helpers. A calendar date is always an ISO "YYYY-MM-DD" string.
	All math runs in UTC on those strings, so results never depend on the
	server's or browser's time zone. Time zones only matter for "what is today
	in the event's zone", which todayInTimeZone answers.
*/


export const DAYS_PER_WEEK = 7;
export const MONTHS_PER_YEAR = 12;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCALE = "en-US";


export function checkIsoDate(value) {

	const match = typeof value === "string" ? ISO_DATE_PATTERN.exec(value) : null;
	if (!match) {
		return false;
	}
	const [, year, month, day] = match.map(Number);
	return month >= 1 && month <= MONTHS_PER_YEAR && day >= 1 && day <= countDaysInMonth(year, month - 1);
}

export function parseIsoDate(isoDate) {

	const [year, month, day] = isoDate.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day));
}

export function formatIsoDate(date) {

	return date.toISOString().slice(0, 10);
}

export function buildIsoDate(year, monthIndex, day) {

	return formatIsoDate(new Date(Date.UTC(year, monthIndex, day)));
}

export function countDaysInMonth(year, monthIndex) {

	return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addDays(isoDate, days) {

	const date = parseIsoDate(isoDate);
	date.setUTCDate(date.getUTCDate() + days);
	return formatIsoDate(date);
}

// Adds months, clamping the day to the target month (Jan 31 + 1 month = Feb 28/29).
export function addMonths(isoDate, months) {

	const date = parseIsoDate(isoDate);
	const targetMonth = date.getUTCMonth() + months;
	const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / MONTHS_PER_YEAR);
	const monthIndex = ((targetMonth % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR;
	const day = Math.min(date.getUTCDate(), countDaysInMonth(targetYear, monthIndex));
	return buildIsoDate(targetYear, monthIndex, day);
}

export function countDaysBetween(fromIsoDate, toIsoDate) {

	return Math.round((parseIsoDate(toIsoDate).getTime() - parseIsoDate(fromIsoDate).getTime()) / MS_PER_DAY);
}

export function getWeekday(isoDate) {

	return parseIsoDate(isoDate).getUTCDay();
}

// Sunday on or before the date (weeks run Sunday–Saturday).
export function findWeekStart(isoDate) {

	return addDays(isoDate, -getWeekday(isoDate));
}

export function findMonthStart(isoDate) {

	return isoDate.slice(0, 8) + "01";
}

export function findMonthEnd(isoDate) {

	const date = parseIsoDate(isoDate);
	return buildIsoDate(date.getUTCFullYear(), date.getUTCMonth(), countDaysInMonth(date.getUTCFullYear(), date.getUTCMonth()));
}

export function listDatesInclusive(startIsoDate, endIsoDate) {

	const dates = [];
	for (let date = startIsoDate; date <= endIsoDate; date = addDays(date, 1)) {
		dates.push(date);
	}
	return dates;
}

export function todayInTimeZone(timeZone, now = new Date()) {

	// en-CA formats as YYYY-MM-DD.
	return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function checkValidTimeZone(timeZone) {

	try {
		new Intl.DateTimeFormat(LOCALE, { timeZone });
		return typeof timeZone === "string" && timeZone.length > 0;
	}
	catch {
		return false;
	}
}

function formatWithOptions(isoDate, options) {

	return parseIsoDate(isoDate).toLocaleDateString(LOCALE, { ...options, timeZone: "UTC" });
}

// "Thu, Oct 1"
export function formatDateShort(isoDate) {

	return formatWithOptions(isoDate, { weekday: "short", month: "short", day: "numeric" });
}

// "Thu, Oct 1, 2026"
export function formatDateMedium(isoDate) {

	return formatWithOptions(isoDate, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// "Thursday, October 1"
export function formatDateLong(isoDate) {

	return formatWithOptions(isoDate, { weekday: "long", month: "long", day: "numeric" });
}

// "Thursday, October 1, 2026"
export function formatDateFull(isoDate) {

	return formatWithOptions(isoDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// "October 2026"
export function formatMonthYear(isoDate) {

	return formatWithOptions(isoDate, { month: "long", year: "numeric" });
}

// "Oct"
export function formatMonthShort(isoDate) {

	return formatWithOptions(isoDate, { month: "short" });
}
