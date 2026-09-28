/*
	The signup date window. All dates are "YYYY-MM-DD"; `today` is today in the
	event's time zone (see todayInTimeZone).

	Fixed: start..end as configured.
	Rolling (approved semantics):
	  days N    today .. today + N − 1
	  weeks N   this Sunday–Saturday week plus the next N whole weeks
	  months N  this month plus the next N whole months
	Minimum days ahead M: nothing before today + M is bookable.
	Past days inside the current week/month stay on the grid but aren't bookable.
*/
import { addDays, addMonths, DAYS_PER_WEEK, findMonthEnd, findMonthStart, findWeekStart } from "../dates.js";


export const WINDOW_MODE = { fixed: "fixed", rolling: "rolling" };
export const ROLLING_UNIT = { days: "days", weeks: "weeks", months: "months" };
export const ROLLING_LIMITS = {
	days: { min: 1, max: 366 },
	weeks: { min: 0, max: 52 },
	months: { min: 0, max: 12 }
};
export const MIN_DAYS_AHEAD_MAX = 60;


function laterDate(a, b) {

	return a > b ? a : b;
}

/*
	Returns { start, end, firstBookable } (all inclusive), or null when the
	config is incomplete (reference key WINDOW_NULL: fixed without dates).
*/
export function deriveDateWindow(config, today) {

	let start;
	let end;
	if (config.windowMode === WINDOW_MODE.fixed) {
		if (!config.fixedStart || !config.fixedEnd) {
			return null;
		}
		start = config.fixedStart;
		end = config.fixedEnd;
	}
	else if (config.rollingUnit === ROLLING_UNIT.days) {
		start = today;
		end = addDays(today, config.rollingSize - 1);
	}
	else if (config.rollingUnit === ROLLING_UNIT.weeks) {
		start = findWeekStart(today);
		end = addDays(start, DAYS_PER_WEEK * (config.rollingSize + 1) - 1);
	}
	else {
		start = findMonthStart(today);
		end = findMonthEnd(addMonths(start, config.rollingSize));
	}
	const firstBookable = laterDate(start, laterDate(today, addDays(today, config.minDaysAhead || 0)));
	return { start, end, firstBookable };
}

export function checkDateBookable(window, date) {

	return Boolean(window) && date >= window.firstBookable && date <= window.end;
}

export function checkDateInWindowRange(window, date) {

	return Boolean(window) && date >= window.start && date <= window.end;
}

// Whole Sunday–Saturday weeks covering the window, for the paper-calendar grid.
export function deriveGridRange(window) {

	if (!window) {
		return null;
	}
	const gridStart = findWeekStart(window.start);
	const gridEnd = addDays(findWeekStart(window.end), DAYS_PER_WEEK - 1);
	return { gridStart, gridEnd };
}
