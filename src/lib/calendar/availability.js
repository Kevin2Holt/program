/*
	Availability resolution (approved semantics, docs/rebuild/03-availability.md).
	For Item I on date D:
	  1. D outside the bookable window                  -> out
	  2. I archived                                      -> archived
	  3. baseline: closed if I has an active RECURRING Allow rule whose bounds
	     contain D; otherwise open
	  4. matching recurring rules: any Block closes; else any Allow opens
	  5. matching one-time rules: any Block closes; else any Allow opens
	  6. closed -> blocked; otherwise capacity decides available / full
	Inactive rules are ignored everywhere. Public views collapse every state
	except "available" into "unavailable".
	This module is pure (no I/O) and runs in the browser and on the server.
*/
import { checkDateBookable } from "./dateWindow.js";
import { checkRuleBoundsContain, checkRuleMatchesDate, checkRuleTargetsItem, RULE_EFFECT, RULE_KIND } from "./recurrence.js";
import { buildOfferingKey, checkHasCapacity } from "./capacity.js";


export const STATUS = {
	available: "available",
	full: "full",
	blocked: "blocked",
	out: "out",
	archived: "archived"
};


function decideTier(rules) {

	const block = rules.find((rule) => rule.effect === RULE_EFFECT.block);
	if (block) {
		return { open: false, rule: block };
	}
	const allow = rules.find((rule) => rule.effect === RULE_EFFECT.allow);
	return allow ? { open: true, rule: allow } : null;
}

/*
	Steps 1–5: whether rules leave the Item open on the date.
	Returns { status: "open" | out | archived | blocked, ruleId }.
*/
export function resolveItemOnDate({ item, date, window, rules }) {

	if (!checkDateBookable(window, date)) {
		return { status: STATUS.out, ruleId: null };
	}
	if (item.archived) {
		return { status: STATUS.archived, ruleId: null };
	}

	const itemRules = rules.filter((rule) => rule.active && checkRuleTargetsItem(rule, item.id));
	const recurring = itemRules.filter((rule) => rule.kind === RULE_KIND.recurring);
	const oneTime = itemRules.filter((rule) => rule.kind === RULE_KIND.once);

	const whitelisted = recurring.some((rule) => rule.effect === RULE_EFFECT.allow && checkRuleBoundsContain(rule, date));
	let open = !whitelisted;
	let ruleId = null;

	for (const tier of [recurring, oneTime]) {
		const decision = decideTier(tier.filter((rule) => checkRuleMatchesDate(rule, date)));
		if (decision) {
			open = decision.open;
			ruleId = decision.rule.id;
		}
	}
	if (!open && ruleId === null) {
		// Closed by whitelist mode: name the Allow rule that caused it.
		ruleId = recurring.find((rule) => rule.effect === RULE_EFFECT.allow && checkRuleBoundsContain(rule, date))?.id ?? null;
	}
	return open ? { status: "open", ruleId } : { status: STATUS.blocked, ruleId };
}

/*
	The occurrences (timed offerings) of an Item on a date: its times that run
	every day plus any limited to this date, excluding archived times.
*/
export function listItemTimesOnDate(times, itemId, date) {

	return times
		.filter((time) => time.itemId === itemId && !time.archived && (!time.onlyDate || time.onlyDate === date))
		.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/*
	Full resolution for one date. usage maps offering keys (buildOfferingKey)
	to the number of active booked selections.
	Returns, per Item: { itemId, status, ruleId, capacity, used, occurrences }
	where occurrences (timed Items only) are { timeId, startTime, durationMinutes,
	label, capacity, used, status }.
	In timed mode an Item with no times is booked for the whole day.
*/
export function resolveDate({ date, items, times, rules, window, usage, timed }) {

	return items.map((item) => {
		const base = resolveItemOnDate({ item, date, window, rules });
		const itemTimes = timed ? listItemTimesOnDate(times, item.id, date) : [];

		if (itemTimes.length) {
			const occurrences = itemTimes.map((time) => {
				const capacity = time.capacityOverride ?? item.capacity;
				const used = usage.get(buildOfferingKey(item.id, date, time.id)) || 0;
				let status = base.status;
				if (status === "open") {
					status = checkHasCapacity(capacity, used) ? STATUS.available : STATUS.full;
				}
				return { timeId: time.id, startTime: time.startTime, durationMinutes: time.durationMinutes, label: time.label, capacity, used, status };
			});
			const anyAvailable = occurrences.some((occurrence) => occurrence.status === STATUS.available);
			const status = base.status === "open" ? (anyAvailable ? STATUS.available : STATUS.full) : base.status;
			return { itemId: item.id, status, ruleId: base.ruleId, capacity: null, used: null, occurrences };
		}

		const used = usage.get(buildOfferingKey(item.id, date, null)) || 0;
		let status = base.status;
		if (status === "open") {
			status = checkHasCapacity(item.capacity, used) ? STATUS.available : STATUS.full;
		}
		return { itemId: item.id, status, ruleId: base.ruleId, capacity: item.capacity, used, occurrences: [] };
	});
}

export function toPublicStatus(status) {

	return status === STATUS.available ? "available" : "unavailable";
}
