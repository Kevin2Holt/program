import { describe, expect, it } from "vitest";
import { addDays, listDatesInclusive } from "../../src/lib/dates.js";
import { checkDateBookable, deriveDateWindow, deriveGridRange } from "../../src/lib/calendar/dateWindow.js";
import { checkRuleMatchesDate, LAST_WEEK_OF_MONTH } from "../../src/lib/calendar/recurrence.js";
import { resolveDate, resolveItemOnDate, STATUS, toPublicStatus } from "../../src/lib/calendar/availability.js";
import { buildOfferingKey } from "../../src/lib/calendar/capacity.js";
import { findOverlappingPairs, findOverlapWith } from "../../src/lib/calendar/overlap.js";
import { pickDefaultIdentity } from "../../src/lib/calendar/palette.js";


const TODAY = "2026-09-28";	// a Monday
const ITEM_A = { id: 1, capacity: 1, archived: false };
const ITEM_B = { id: 2, capacity: 1, archived: false };
const ITEM_C = { id: 3, capacity: 1, archived: false };
const ITEM_D = { id: 4, capacity: 1, archived: false };
const WINDOW = deriveDateWindow({ windowMode: "rolling", rollingUnit: "weeks", rollingSize: 3, minDaysAhead: 0 }, TODAY);

let ruleCounter = 0;


function buildRule(overrides) {

	ruleCounter += 1;
	return {
		id: ruleCounter,
		effect: "block",
		kind: "recurring",
		frequency: "weekly",
		weekdays: [],
		onceDate: null,
		monthDay: null,
		monthWeek: null,
		monthWeekday: null,
		startsOn: null,
		endsOn: null,
		appliesTo: "all",
		itemIds: [],
		active: true,
		...overrides
	};
}

function resolveStatus(item, date, rules, usage = new Map()) {

	return resolveDate({ date, items: [item], times: [], rules, window: WINDOW, usage, timed: false })[0].status;
}


describe("date window", () => {
	it("rolling weeks: this week plus N whole weeks", () => {
		expect(WINDOW).toEqual({ start: "2026-09-27", end: "2026-10-24", firstBookable: "2026-09-28" });
		expect(deriveGridRange(WINDOW)).toEqual({ gridStart: "2026-09-27", gridEnd: "2026-10-24" });
	});

	it("rolling days: a literal count starting today", () => {
		expect(deriveDateWindow({ windowMode: "rolling", rollingUnit: "days", rollingSize: 7, minDaysAhead: 0 }, TODAY)).toEqual({ start: TODAY, end: "2026-10-04", firstBookable: TODAY });
	});

	it("rolling months: this month plus N whole months, snapping to month ends", () => {
		expect(deriveDateWindow({ windowMode: "rolling", rollingUnit: "months", rollingSize: 1, minDaysAhead: 0 }, "2026-01-31")).toEqual({ start: "2026-01-01", end: "2026-02-28", firstBookable: "2026-01-31" });
		expect(deriveDateWindow({ windowMode: "rolling", rollingUnit: "months", rollingSize: 0, minDaysAhead: 0 }, TODAY).end).toBe("2026-09-30");
	});

	it("the next week opens on Sunday", () => {
		const saturday = deriveDateWindow({ windowMode: "rolling", rollingUnit: "weeks", rollingSize: 1, minDaysAhead: 0 }, "2026-10-03");
		const sunday = deriveDateWindow({ windowMode: "rolling", rollingUnit: "weeks", rollingSize: 1, minDaysAhead: 0 }, "2026-10-04");
		expect(saturday.end).toBe("2026-10-10");
		expect(sunday.end).toBe("2026-10-17");
	});

	it("fixed ranges, and a date falling out of a rolling window", () => {
		const fixed = deriveDateWindow({ windowMode: "fixed", fixedStart: "2026-10-15", fixedEnd: "2026-10-17", minDaysAhead: 0 }, TODAY);
		expect(checkDateBookable(fixed, "2026-10-15")).toBe(true);
		expect(checkDateBookable(fixed, "2026-10-18")).toBe(false);
		expect(checkDateBookable(WINDOW, "2026-09-27")).toBe(false);	// yesterday
		const nextWeek = deriveDateWindow({ windowMode: "rolling", rollingUnit: "weeks", rollingSize: 3, minDaysAhead: 0 }, "2026-10-05");
		expect(checkDateBookable(nextWeek, "2026-10-04")).toBe(false);
		expect(deriveDateWindow({ windowMode: "fixed", fixedStart: null, fixedEnd: null }, TODAY)).toBeNull();
	});

	it("minimum days ahead pushes the first bookable date", () => {
		const window = deriveDateWindow({ windowMode: "rolling", rollingUnit: "weeks", rollingSize: 3, minDaysAhead: 2 }, TODAY);
		expect(window.firstBookable).toBe("2026-09-30");
		expect(checkDateBookable(window, "2026-09-29")).toBe(false);
		expect(checkDateBookable(window, "2026-09-30")).toBe(true);
	});
});

describe("recurrence", () => {
	it("weekly on chosen weekdays", () => {
		const rule = buildRule({ weekdays: [2, 4, 6] });
		expect(checkRuleMatchesDate(rule, "2026-10-06")).toBe(true);	// Tue
		expect(checkRuleMatchesDate(rule, "2026-10-07")).toBe(false);	// Wed
	});

	it("biweekly counts Sunday–Saturday weeks from the start date's week", () => {
		const rule = buildRule({ frequency: "biweekly", weekdays: [3], startsOn: "2026-09-30" });
		expect(checkRuleMatchesDate(rule, "2026-09-30")).toBe(true);
		expect(checkRuleMatchesDate(rule, "2026-10-07")).toBe(false);
		expect(checkRuleMatchesDate(rule, "2026-10-14")).toBe(true);
		expect(checkRuleMatchesDate(rule, "2026-09-16")).toBe(false);	// before the start
		expect(checkRuleMatchesDate({ ...rule, startsOn: null }, "2026-09-30")).toBe(false);
	});

	it("monthly by date skips months without that day", () => {
		const rule = buildRule({ frequency: "monthly_date", monthDay: 31 });
		expect(checkRuleMatchesDate(rule, "2026-10-31")).toBe(true);
		expect(listDatesInclusive("2026-11-01", "2026-11-30").some((date) => checkRuleMatchesDate(rule, date))).toBe(false);
	});

	it("monthly by weekday: first Sunday, and the last one", () => {
		const first = buildRule({ frequency: "monthly_weekday", monthWeek: 1, monthWeekday: 0 });
		expect(checkRuleMatchesDate(first, "2026-10-04")).toBe(true);
		expect(checkRuleMatchesDate(first, "2026-10-11")).toBe(false);
		const last = buildRule({ frequency: "monthly_weekday", monthWeek: LAST_WEEK_OF_MONTH, monthWeekday: 5 });
		expect(checkRuleMatchesDate(last, "2026-10-30")).toBe(true);
		expect(checkRuleMatchesDate(last, "2026-10-23")).toBe(false);
		const fourth = buildRule({ frequency: "monthly_weekday", monthWeek: 4, monthWeekday: 5 });
		expect(checkRuleMatchesDate(fourth, "2026-10-23")).toBe(true);
	});

	it("respects inclusive start and end bounds", () => {
		const rule = buildRule({ frequency: "daily", startsOn: "2026-10-01", endsOn: "2026-10-03" });
		expect(["2026-09-30", "2026-10-01", "2026-10-03", "2026-10-04"].map((date) => checkRuleMatchesDate(rule, date))).toEqual([false, true, true, false]);
	});

	it("one-time rules match only their date", () => {
		const rule = buildRule({ kind: "once", onceDate: "2026-10-10", frequency: null });
		expect(checkRuleMatchesDate(rule, "2026-10-10")).toBe(true);
		expect(checkRuleMatchesDate(rule, "2026-10-17")).toBe(false);
	});
});

describe("availability worked examples (docs/rebuild/03-availability.md)", () => {
	const blockSundays = buildRule({ weekdays: [0] });
	const allowOct4 = buildRule({ effect: "allow", kind: "once", onceDate: "2026-10-04" });

	it("1: recurring Sunday Block + one-time Allow opens that Sunday only", () => {
		expect(resolveStatus(ITEM_A, "2026-10-04", [blockSundays, allowOct4])).toBe(STATUS.available);
		expect(resolveStatus(ITEM_A, "2026-10-11", [blockSundays, allowOct4])).toBe(STATUS.blocked);
	});

	it("1c: a one-time Allow does not whitelist the Item (change A)", () => {
		expect(resolveStatus(ITEM_A, "2026-10-07", [blockSundays, allowOct4])).toBe(STATUS.available);
	});

	it("2: an Allow scoped to Selected Items only affects those Items", () => {
		const allowTTS = buildRule({ effect: "allow", weekdays: [2, 4, 6], appliesTo: "selected", itemIds: [ITEM_D.id] });
		expect(resolveStatus(ITEM_D, "2026-10-07", [allowTTS])).toBe(STATUS.blocked);
		expect(resolveStatus(ITEM_D, "2026-10-08", [allowTTS])).toBe(STATUS.available);
		expect(resolveStatus(ITEM_A, "2026-10-07", [allowTTS])).toBe(STATUS.available);
	});

	it("3: an Item with only Block rules starts open", () => {
		const blockMondays = buildRule({ weekdays: [1] });
		expect(resolveStatus(ITEM_B, "2026-10-06", [blockMondays])).toBe(STATUS.available);
		expect(resolveStatus(ITEM_B, "2026-10-05", [blockMondays])).toBe(STATUS.blocked);
	});

	it("4: recurring Allow and Block on the same date: Block wins", () => {
		const allowWeekdays = buildRule({ effect: "allow", weekdays: [1, 2, 3, 4, 5] });
		const blockBiweekly = buildRule({ frequency: "biweekly", weekdays: [3], startsOn: "2026-09-30", appliesTo: "selected", itemIds: [ITEM_B.id] });
		expect(resolveStatus(ITEM_B, "2026-10-14", [allowWeekdays, blockBiweekly])).toBe(STATUS.blocked);
		expect(resolveStatus(ITEM_B, "2026-10-07", [allowWeekdays, blockBiweekly])).toBe(STATUS.available);
	});

	it("5: one-time Allow and Block on the same date: Block wins", () => {
		const blockOnce = buildRule({ kind: "once", onceDate: "2026-10-10" });
		const allowOnce = buildRule({ effect: "allow", kind: "once", onceDate: "2026-10-10", appliesTo: "selected", itemIds: [ITEM_C.id] });
		expect(resolveStatus(ITEM_C, "2026-10-10", [blockOnce, allowOnce])).toBe(STATUS.blocked);
	});

	it("6: a one-time Allow overrides recurring rules even for a whitelisted Item", () => {
		const blockMondays = buildRule({ weekdays: [1] });
		const allowTTS = buildRule({ effect: "allow", weekdays: [2, 4, 6], appliesTo: "selected", itemIds: [ITEM_D.id] });
		const allowOct12 = buildRule({ effect: "allow", kind: "once", onceDate: "2026-10-12" });
		expect(resolveStatus(ITEM_D, "2026-10-12", [blockMondays, allowTTS, allowOct12])).toBe(STATUS.available);
	});

	it("7: archived Items stay unavailable even with an Allow", () => {
		const allowOnce = buildRule({ effect: "allow", kind: "once", onceDate: "2026-10-06" });
		expect(resolveStatus({ ...ITEM_A, archived: true }, "2026-10-06", [allowOnce])).toBe(STATUS.archived);
	});

	it("8: a recurring Allow whitelists only inside its bounds (change B)", () => {
		const allowFromNov = buildRule({ effect: "allow", weekdays: [2, 4, 6], startsOn: "2026-11-01", appliesTo: "selected", itemIds: [ITEM_D.id] });
		expect(resolveStatus(ITEM_D, "2026-10-07", [allowFromNov])).toBe(STATUS.available);
	});

	it("9: capacity used up means full (public: unavailable)", () => {
		const usage = new Map([[buildOfferingKey(ITEM_A.id, "2026-10-01", null), 1]]);
		const status = resolveStatus(ITEM_A, "2026-10-01", [], usage);
		expect(status).toBe(STATUS.full);
		expect(toPublicStatus(status)).toBe("unavailable");
	});

	it("10: inactive rules are ignored", () => {
		expect(resolveStatus(ITEM_A, "2026-10-05", [buildRule({ weekdays: [1], active: false })])).toBe(STATUS.available);
		expect(resolveStatus(ITEM_D, "2026-10-07", [buildRule({ effect: "allow", weekdays: [2], active: false })])).toBe(STATUS.available);
	});

	it("11: past dates are out of window", () => {
		expect(resolveStatus(ITEM_A, "2026-09-27", [])).toBe(STATUS.out);
	});

	it("12: timed capacity is per occurrence; the day stays available while any time has room", () => {
		const times = [
			{ id: 10, itemId: ITEM_A.id, startTime: "12:00", durationMinutes: 60, label: "", capacityOverride: 2, onlyDate: null, archived: false },
			{ id: 11, itemId: ITEM_A.id, startTime: "17:30", durationMinutes: 60, label: "", capacityOverride: null, onlyDate: null, archived: false }
		];
		const usage = new Map([[buildOfferingKey(ITEM_A.id, "2026-10-15", 11), 1]]);
		const blockB = buildRule({ kind: "once", onceDate: "2026-10-15", appliesTo: "selected", itemIds: [ITEM_B.id] });
		const [result] = resolveDate({ date: "2026-10-15", items: [ITEM_A], times, rules: [blockB], window: WINDOW, usage, timed: true });
		expect(result.status).toBe(STATUS.available);
		expect(result.occurrences.map((occurrence) => [occurrence.startTime, occurrence.status])).toEqual([["12:00", "available"], ["17:30", "full"]]);
	});

	it("names the rule that blocked a date (organizer reporting)", () => {
		const blockMondays = buildRule({ weekdays: [1] });
		expect(resolveItemOnDate({ item: ITEM_A, date: "2026-10-05", window: WINDOW, rules: [blockMondays] }).ruleId).toBe(blockMondays.id);
	});
});

describe("availability properties (random sweep)", () => {
	const DATES = listDatesInclusive("2026-09-28", addDays("2026-09-28", 400));
	const EXTENDED_WINDOW = { start: "2026-09-28", end: DATES.at(-1), firstBookable: "2026-09-28" };

	function buildRandomRules(seed) {

		let state = seed;
		const next = (max) => {
			state = (state * 1103515245 + 12345) % 2147483648;
			return state % max;
		};
		const rules = [];
		for (let index = 0; index < 5; index += 1) {
			const once = next(3) === 0;
			rules.push(buildRule({
				effect: next(2) ? "allow" : "block",
				kind: once ? "once" : "recurring",
				onceDate: once ? DATES[next(DATES.length)] : null,
				frequency: once ? null : ["daily", "weekly", "monthly_date"][next(3)],
				weekdays: [next(7), next(7)],
				monthDay: next(28) + 1,
				appliesTo: next(2) ? "all" : "selected",
				itemIds: [ITEM_A.id],
				active: next(4) !== 0
			}));
		}
		return rules;
	}

	it("a matching Block in the deciding tier always closes the date", () => {
		for (let seed = 1; seed <= 40; seed += 1) {
			const rules = buildRandomRules(seed);
			for (const date of DATES) {
				const oneTimeBlocks = rules.filter((rule) => rule.active && rule.kind === "once" && rule.effect === "block" && checkRuleMatchesDate(rule, date));
				if (oneTimeBlocks.length) {
					expect(resolveItemOnDate({ item: ITEM_A, date, window: EXTENDED_WINDOW, rules }).status).toBe(STATUS.blocked);
				}
			}
		}
	});

	it("inactive rules and rules for other Items never change the result", () => {
		for (let seed = 1; seed <= 20; seed += 1) {
			const rules = buildRandomRules(seed);
			const withNoise = [...rules, buildRule({ weekdays: [0, 1, 2, 3, 4, 5, 6], active: false }), buildRule({ frequency: "daily", appliesTo: "selected", itemIds: [ITEM_B.id] })];
			for (const date of DATES.slice(0, 120)) {
				expect(resolveItemOnDate({ item: ITEM_A, date, window: EXTENDED_WINDOW, rules: withNoise }).status)
					.toBe(resolveItemOnDate({ item: ITEM_A, date, window: EXTENDED_WINDOW, rules }).status);
			}
		}
	});
});

describe("overlap", () => {
	const base = { date: "2026-10-15" };

	it("detects same-day overlaps only; touching times don't overlap", () => {
		const leading = { ...base, startTime: "09:00", durationMinutes: 60 };
		const design = { ...base, startTime: "09:30", durationMinutes: 90 };
		const later = { ...base, startTime: "10:00", durationMinutes: 60 };
		const otherDay = { date: "2026-10-16", startTime: "09:30", durationMinutes: 90 };
		const allDay = { ...base, startTime: null, durationMinutes: null };
		expect(findOverlappingPairs([leading, design, later, otherDay, allDay])).toEqual([[0, 1], [1, 2]]);
		expect(findOverlapWith(later, [leading])).toBeNull();
		expect(findOverlapWith(otherDay, [design])).toBeNull();
	});
});

describe("palette", () => {
	it("the first 12 Items all get different colors", () => {
		const colors = Array.from({ length: 12 }, (_, index) => pickDefaultIdentity(index).color);
		expect(new Set(colors).size).toBe(12);
		expect(pickDefaultIdentity(0).shape).not.toBe(pickDefaultIdentity(1).shape);
	});
});
