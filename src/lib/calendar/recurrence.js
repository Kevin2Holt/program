/*
	Whether an availability rule matches a date. Dates are "YYYY-MM-DD".

	Frequencies:
	  daily            every date
	  weekly           the weekday is one of rule.weekdays (0 = Sunday)
	  biweekly         weekly, but only in the week of startsOn and every second
	                   week after it (weeks run Sunday–Saturday)
	  monthly_date     day monthDay of each month; months without it are skipped
	  monthly_weekday  the monthWeek-th monthWeekday of the month (1–4), or the
	                   last one when monthWeek is LAST_WEEK_OF_MONTH (-1)
	Bounds startsOn/endsOn are inclusive and optional.
*/
import { addDays, countDaysBetween, DAYS_PER_WEEK, findWeekStart, getWeekday } from "../dates.js";


export const RULE_EFFECT = { allow: "allow", block: "block" };
export const RULE_KIND = { once: "once", recurring: "recurring" };
export const FREQUENCY = {
	daily: "daily",
	weekly: "weekly",
	biweekly: "biweekly",
	monthlyDate: "monthly_date",
	monthlyWeekday: "monthly_weekday"
};
export const LAST_WEEK_OF_MONTH = -1;	// reference key: monthWeek sentinel for "last"
const WEEKS_PER_BIWEEK = 2;


function checkWithinBounds(rule, date) {

	return (!rule.startsOn || date >= rule.startsOn) && (!rule.endsOn || date <= rule.endsOn);
}

function readDayOfMonth(date) {

	return Number(date.slice(8, 10));
}

function checkRecurringMatch(rule, date) {

	const weekday = getWeekday(date);
	switch (rule.frequency) {
		case FREQUENCY.daily:
			return true;
		case FREQUENCY.weekly:
			return rule.weekdays.includes(weekday);
		case FREQUENCY.biweekly: {
			if (!rule.weekdays.includes(weekday) || !rule.startsOn) {
				return false;
			}
			const weeksApart = countDaysBetween(findWeekStart(rule.startsOn), findWeekStart(date)) / DAYS_PER_WEEK;
			return weeksApart % WEEKS_PER_BIWEEK === 0;
		}
		case FREQUENCY.monthlyDate:
			return readDayOfMonth(date) === rule.monthDay;
		case FREQUENCY.monthlyWeekday: {
			if (weekday !== rule.monthWeekday) {
				return false;
			}
			if (rule.monthWeek === LAST_WEEK_OF_MONTH) {
				return addDays(date, DAYS_PER_WEEK).slice(0, 7) !== date.slice(0, 7);
			}
			return Math.ceil(readDayOfMonth(date) / DAYS_PER_WEEK) === rule.monthWeek;
		}
		default:
			return false;
	}
}

export function checkRuleMatchesDate(rule, date) {

	if (rule.kind === RULE_KIND.once) {
		return rule.onceDate === date;
	}
	return checkWithinBounds(rule, date) && checkRecurringMatch(rule, date);
}

// Recurring Allow rules put an Item in whitelist mode only inside their own bounds.
export function checkRuleBoundsContain(rule, date) {

	return checkWithinBounds(rule, date);
}

export function checkRuleTargetsItem(rule, itemId) {

	return rule.appliesTo === "all" || rule.itemIds.includes(itemId);
}
