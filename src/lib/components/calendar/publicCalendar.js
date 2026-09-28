/* Helpers for the public calendar's client state (pure; shared by its components). */
import { addDays, DAYS_PER_WEEK } from "$lib/dates.js";
import { buildOfferingKey } from "$lib/calendar/capacity.js";


export const PICKS_STORAGE_PREFIX = "progr-picks:";


export function buildPick(date, offering) {

	return {
		key: buildOfferingKey(offering.itemId, date, offering.timeId),
		date,
		itemId: offering.itemId,
		timeId: offering.timeId,
		startTime: offering.startTime,
		durationMinutes: offering.durationMinutes,
		label: offering.label
	};
}

export function sortPicks(picks) {

	return [...picks].sort((a, b) => (a.date + (a.startTime || "")).localeCompare(b.date + (b.startTime || "")));
}

export function buildGridWeeks(grid) {

	const weeks = [];
	for (let weekStart = grid.gridStart; weekStart <= grid.gridEnd; weekStart = addDays(weekStart, DAYS_PER_WEEK)) {
		weeks.push(Array.from({ length: DAYS_PER_WEEK }, (_, index) => addDays(weekStart, index)));
	}
	return weeks;
}

export function readStoredPicks(code) {

	try {
		const raw = sessionStorage.getItem(PICKS_STORAGE_PREFIX + code);
		return raw ? JSON.parse(raw) : [];
	}
	catch {
		return [];
	}
}

export function storePicks(code, picks) {

	try {
		if (picks.length) {
			sessionStorage.setItem(PICKS_STORAGE_PREFIX + code, JSON.stringify(picks));
		}
		else {
			sessionStorage.removeItem(PICKS_STORAGE_PREFIX + code);
		}
	}
	catch {
		// Storage can be unavailable (private mode); picks still work for this page view.
	}
}

export function describeTimeZone(timeZone) {

	try {
		const longName = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" }).formatToParts(new Date()).find((part) => part.type === "timeZoneName")?.value;
		return longName ? `${longName} (${timeZone})` : timeZone;
	}
	catch {
		return timeZone;
	}
}
