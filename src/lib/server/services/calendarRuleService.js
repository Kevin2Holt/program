/*
	Availability rule rules. Each rule is Allow or Block, one date or recurring,
	and applies to All Items or Selected Items. "Applies to" normalizes the same
	way the form switches: none checked or every active Item checked = All Items.
	Rules can be deactivated or deleted outright.
*/
import { checkHasErrors, fail, failInvalid, RESULT_CODE, succeed } from "$lib/result.js";
import { checkIsoDate } from "$lib/dates.js";
import { FREQUENCY, LAST_WEEK_OF_MONTH, RULE_EFFECT, RULE_KIND } from "$lib/calendar/recurrence.js";
import { LIMITS, normalizeText } from "$lib/validation.js";
import { sql } from "../db.js";
import { deleteRuleRow, insertRuleRow, listItemRows, listRuleRows, replaceRuleItems, setRuleActiveRow, updateRuleRow } from "../data/calendar.js";
import { touchEvent } from "../data/events.js";


const MONTH_DAY_MAX = 31;
const MONTH_WEEKS = [1, 2, 3, 4, LAST_WEEK_OF_MONTH];
const WEEKDAY_MAX = 6;


function validateRule(input, activeItemIds) {

	const errors = {};
	const kind = input.kind === RULE_KIND.once ? RULE_KIND.once : RULE_KIND.recurring;
	const rule = {
		effect: input.effect === RULE_EFFECT.allow ? RULE_EFFECT.allow : RULE_EFFECT.block,
		kind,
		onceDate: null,
		frequency: null,
		weekdays: [],
		monthDay: null,
		monthWeek: null,
		monthWeekday: null,
		startsOn: null,
		endsOn: null,
		appliesTo: "all",
		itemIds: [],
		label: normalizeText(input.label).slice(0, LIMITS.ruleLabelMax),
		active: input.active !== false
	};

	if (kind === RULE_KIND.once) {
		rule.onceDate = input.onceDate || null;
		if (!checkIsoDate(rule.onceDate)) {
			errors.onceDate = "Choose the date.";
		}
	}
	else {
		rule.frequency = Object.values(FREQUENCY).includes(input.frequency) ? input.frequency : null;
		rule.startsOn = input.startsOn || null;
		rule.endsOn = input.endsOn || null;
		if (!rule.frequency) {
			errors.frequency = "Choose how often it repeats.";
		}
		if (rule.frequency === FREQUENCY.weekly || rule.frequency === FREQUENCY.biweekly) {
			rule.weekdays = [...new Set((input.weekdays || []).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= WEEKDAY_MAX))].sort((a, b) => a - b);
			if (!rule.weekdays.length) {
				errors.weekdays = "Pick at least one day.";
			}
		}
		if (rule.frequency === FREQUENCY.biweekly && !rule.startsOn) {
			errors.startsOn = "Every-2-weeks rules need a start date to count from.";
		}
		if (rule.frequency === FREQUENCY.monthlyDate) {
			rule.monthDay = Number(input.monthDay);
			if (!Number.isInteger(rule.monthDay) || rule.monthDay < 1 || rule.monthDay > MONTH_DAY_MAX) {
				errors.monthDay = "Use a day from 1 to 31.";
			}
		}
		if (rule.frequency === FREQUENCY.monthlyWeekday) {
			rule.monthWeek = Number(input.monthWeek);
			rule.monthWeekday = Number(input.monthWeekday);
			if (!MONTH_WEEKS.includes(rule.monthWeek) || !Number.isInteger(rule.monthWeekday) || rule.monthWeekday < 0 || rule.monthWeekday > WEEKDAY_MAX) {
				errors.monthWeek = "Choose which week and weekday.";
			}
		}
		if (rule.startsOn && !checkIsoDate(rule.startsOn)) {
			errors.startsOn = "Choose a valid start date.";
		}
		if (rule.endsOn && !checkIsoDate(rule.endsOn)) {
			errors.endsOn = "Choose a valid end date.";
		}
		else if (rule.startsOn && rule.endsOn && rule.endsOn < rule.startsOn) {
			errors.endsOn = "The end date must be on or after the start date.";
		}
	}

	const chosen = [...new Set((input.itemIds || []).map(Number))].filter((itemId) => activeItemIds.includes(itemId));
	const allChosen = activeItemIds.length > 0 && activeItemIds.every((itemId) => chosen.includes(itemId));
	if (input.appliesTo === "selected" && chosen.length && !allChosen) {
		rule.appliesTo = "selected";
		rule.itemIds = chosen.sort((a, b) => a - b);
	}
	return { rule, errors };
}


export async function listCalendarRules(eventId) {

	return listRuleRows(sql, eventId);
}

export async function saveCalendarRule(eventId, ruleId, input) {

	const activeItemIds = (await listItemRows(sql, eventId)).filter((item) => !item.archived).map((item) => item.id);
	const { rule, errors } = validateRule(input || {}, activeItemIds);
	if (checkHasErrors(errors)) {
		return failInvalid(errors);
	}
	return sql.begin(async (tx) => {
		let savedId = ruleId;
		if (ruleId) {
			if (!await updateRuleRow(tx, eventId, ruleId, rule)) {
				return fail(RESULT_CODE.notFound, "That rule no longer exists.");
			}
		}
		else {
			savedId = await insertRuleRow(tx, eventId, rule);
		}
		await replaceRuleItems(tx, eventId, savedId, rule.itemIds);
		await touchEvent(tx, eventId);
		return succeed({ ...rule, id: savedId });
	});
}

export async function setCalendarRuleActive(eventId, ruleId, active) {

	return await setRuleActiveRow(sql, eventId, ruleId, Boolean(active)) ? succeed() : fail(RESULT_CODE.notFound, "That rule no longer exists.");
}

export async function deleteCalendarRule(eventId, ruleId) {

	return await deleteRuleRow(sql, eventId, ruleId) ? succeed() : fail(RESULT_CODE.notFound, "That rule no longer exists.");
}
