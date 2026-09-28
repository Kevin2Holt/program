/*
	Server side of availability: loads everything the pure engine needs
	($lib/calendar/availability.js) and runs it for a range of dates. Capacity
	usage always comes from stored selections of active bookings.
*/
import { addDays, checkIsoDate, DAYS_PER_WEEK, findWeekStart, listDatesInclusive, todayInTimeZone } from "$lib/dates.js";
import { deriveDateWindow, deriveGridRange } from "$lib/calendar/dateWindow.js";
import { resolveDate, STATUS } from "$lib/calendar/availability.js";
import { buildUsageMap } from "$lib/calendar/capacity.js";
import { sql } from "../db.js";
import { countBookingsSince, countUpcomingSelections, findConfig, listItemRows, listRuleRows, listTimeRows, listUsageRows } from "../data/calendar.js";


const RECENT_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PERCENT = 100;


export async function loadCalendarContext(eventId, db = sql) {

	const config = await findConfig(db, eventId);
	if (!config) {
		return null;
	}
	const [items, times, rules] = await Promise.all([
		listItemRows(db, eventId),
		listTimeRows(db, eventId, { includeArchived: true }),
		listRuleRows(db, eventId)
	]);
	return { config, items, times, rules };
}

export function deriveContextWindow(context, now = new Date()) {

	const today = todayInTimeZone(context.config.timeZone, now);
	return { today, window: deriveDateWindow(context.config, today) };
}

// Resolves every date from fromDate to toDate. Returns [{ date, items: [...] }].
export async function resolveAvailabilityRange(context, { fromDate, toDate, window, excludeBookingId = null, db = sql }) {

	const usage = buildUsageMap(await listUsageRows(db, context.config.eventId, fromDate, toDate, excludeBookingId));
	return listDatesInclusive(fromDate, toDate).map((date) => ({
		date,
		items: resolveDate({ date, items: context.items, times: context.times, rules: context.rules, window, usage, timed: context.config.timed })
	}));
}

// One Sunday–Saturday week of organizer statuses plus summary numbers, for the overview.
export async function buildOrganizerWeek(eventId, requestedWeek = null) {

	const context = await loadCalendarContext(eventId);
	if (!context) {
		return null;
	}
	const { today, window } = deriveContextWindow(context);
	const weekStart = findWeekStart(checkIsoDate(requestedWeek) ? requestedWeek : today);
	const days = await resolveAvailabilityRange(context, { fromDate: weekStart, toDate: addDays(weekStart, DAYS_PER_WEEK - 1), window });

	let openCount = 0;
	let fullCount = 0;
	for (const day of days) {
		for (const entry of day.items) {
			const units = entry.occurrences.length ? entry.occurrences : [entry];
			openCount += units.filter((unit) => unit.status === STATUS.available).length;
			fullCount += units.filter((unit) => unit.status === STATUS.full).length;
		}
	}
	const since = new Date(Date.now() - RECENT_DAYS * MS_PER_DAY);
	const stats = {
		upcoming: await countUpcomingSelections(sql, eventId, today),
		openThisWeek: openCount,
		filledPercent: openCount + fullCount ? Math.round((fullCount / (openCount + fullCount)) * PERCENT) : null,
		recentBookings: await countBookingsSince(sql, eventId, since)
	};
	return { today, window, grid: deriveGridRange(window), weekStart, days, context, stats };
}
