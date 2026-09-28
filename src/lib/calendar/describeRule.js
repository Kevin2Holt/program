/* Plain-English summaries of availability rules for lists and the form preview. */
import { formatDateLong, formatDateMedium } from "../dates.js";
import { FREQUENCY, LAST_WEEK_OF_MONTH, RULE_KIND } from "./recurrence.js";


const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINALS = { 1: "first", 2: "second", 3: "third", 4: "fourth", [LAST_WEEK_OF_MONTH]: "last" };
const EVERY_DAY_COUNT = 7;


function formatWeekdayList(weekdays) {

	const sorted = [...weekdays].sort((a, b) => a - b);
	if (sorted.length === 1) {
		return WEEKDAY_LONG[sorted[0]];
	}
	return sorted.map((day) => WEEKDAY_SHORT[day]).join(", ");
}

function formatOrdinalDay(day) {

	const suffixes = { 1: "st", 2: "nd", 3: "rd", 21: "st", 22: "nd", 23: "rd", 31: "st" };
	return `${day}${suffixes[day] || "th"}`;
}

// "Block every Monday", "Allow Tue, Thu, Sat", "Block Saturday, October 10"…
export function describeRuleTitle(rule) {

	const verb = rule.effect === "allow" ? "Allow" : "Block";
	if (rule.kind === RULE_KIND.once) {
		return rule.onceDate ? `${verb} ${formatDateLong(rule.onceDate)}` : `${verb} one date`;
	}
	switch (rule.frequency) {
		case FREQUENCY.daily:
			return `${verb} every day`;
		case FREQUENCY.weekly:
			if (rule.weekdays.length === EVERY_DAY_COUNT) {
				return `${verb} every day`;
			}
			return rule.weekdays.length === 1 ? `${verb} every ${formatWeekdayList(rule.weekdays)}` : `${verb} ${formatWeekdayList(rule.weekdays)}`;
		case FREQUENCY.biweekly:
			return `${verb} every other ${formatWeekdayList(rule.weekdays)}`;
		case FREQUENCY.monthlyDate:
			return `${verb} the ${formatOrdinalDay(rule.monthDay)} of each month`;
		case FREQUENCY.monthlyWeekday:
			return `${verb} the ${ORDINALS[rule.monthWeek]} ${WEEKDAY_LONG[rule.monthWeekday]} of each month`;
		default:
			return verb;
	}
}

export function describeRuleSchedule(rule) {

	if (rule.kind === RULE_KIND.once) {
		return "One date";
	}
	const labels = { daily: "Daily", weekly: "Weekly", biweekly: "Every 2 weeks", monthly_date: "Monthly", monthly_weekday: "Monthly" };
	const parts = [labels[rule.frequency] || "Repeats"];
	if (rule.startsOn) {
		parts.push(`from ${formatDateMedium(rule.startsOn)}`);
	}
	if (rule.endsOn) {
		parts.push(`until ${formatDateMedium(rule.endsOn)}`);
	}
	return parts.join(" · ");
}
