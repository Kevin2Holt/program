import { beforeEach, describe, expect, it } from "vitest";
import { createCalendar, updateCalendarConfig } from "../../src/lib/server/services/calendarConfigService.js";
import { archiveCalendarItem, listCalendarItems, moveCalendarItem, saveCalendarItem, suggestNewItemIdentity } from "../../src/lib/server/services/calendarItemService.js";
import { deleteCalendarRule, listCalendarRules, saveCalendarRule, setCalendarRuleActive } from "../../src/lib/server/services/calendarRuleService.js";
import { deriveContextWindow, loadCalendarContext, resolveAvailabilityRange } from "../../src/lib/server/services/calendarAvailabilityService.js";
import { clearAllTables, sql } from "../helpers/database.js";
import { createTestEvent, createTestUser } from "../helpers/factories.js";


let owner;
let eventId;

beforeEach(async () => {
	await clearAllTables();
	owner = await createTestUser();
	eventId = (await createTestEvent(owner.id)).id;
	await createCalendar(eventId, { timeZone: "America/Denver" });
});


async function addItem(name, overrides = {}) {

	const identity = await suggestNewItemIdentity(eventId);
	const result = await saveCalendarItem(eventId, null, { name, capacity: 1, ...identity, times: [], ...overrides });
	expect(result.ok).toBe(true);
	return result.value;
}


describe("calendar setup", () => {
	it("creates a calendar with safe defaults, once", async () => {
		const again = await createCalendar(eventId, { timeZone: "Not/AZone" });
		expect(again.value).toMatchObject({ status: "draft", timeZone: "America/Denver", windowMode: "rolling", rollingUnit: "weeks", rollingSize: 3, minDaysAhead: 0 });
	});

	it("validates only the fields for the chosen window type", async () => {
		expect((await updateCalendarConfig(eventId, { windowMode: "fixed" })).errors).toMatchObject({ fixedStart: expect.any(String), fixedEnd: expect.any(String) });
		expect((await updateCalendarConfig(eventId, { windowMode: "fixed", fixedStart: "2026-10-17", fixedEnd: "2026-10-15" })).errors.fixedEnd).toBeTruthy();
		expect((await updateCalendarConfig(eventId, { windowMode: "fixed", fixedStart: "2026-10-15", fixedEnd: "2026-10-17" })).ok).toBe(true);
		expect((await updateCalendarConfig(eventId, { windowMode: "rolling", rollingUnit: "days", rollingSize: 0 })).errors.rollingSize).toBeTruthy();
		expect((await updateCalendarConfig(eventId, { windowMode: "rolling", rollingUnit: "weeks", rollingSize: 0 })).ok).toBe(true);
	});

	it("rejects unknown time zones and out-of-range minimum days ahead", async () => {
		expect((await updateCalendarConfig(eventId, { timeZone: "Mars/Olympus" })).errors.timeZone).toBeTruthy();
		expect((await updateCalendarConfig(eventId, { minDaysAhead: 61 })).errors.minDaysAhead).toBeTruthy();
		expect((await updateCalendarConfig(eventId, { minDaysAhead: 2, timeZone: "Asia/Manila" })).value).toMatchObject({ minDaysAhead: 2, timeZone: "Asia/Manila" });
	});

	it("turns email confirmation off unless the email field is on, and hides phone extras without phone", async () => {
		const noEmail = await updateCalendarConfig(eventId, { emailConfirmation: true });
		expect(noEmail.value.emailConfirmation).toBe(false);
		const withEmail = await updateCalendarConfig(eventId, { emailConfirmation: true, formFields: { phone: { on: false }, contactMethod: { on: true }, email: { on: true, required: true }, notes: { on: true } } });
		expect(withEmail.value.emailConfirmation).toBe(true);
		expect(withEmail.value.formFields.contactMethod).toEqual({ on: false, required: false });
	});
});

describe("items", () => {
	it("auto-assigns distinct identities and keeps list order", async () => {
		const first = await addItem("Elders Ramos & Chen");
		const second = await addItem("Elders Tuilagi & Brooks");
		expect(first.color).not.toBe(second.color);
		expect(first.shape).not.toBe(second.shape);
		await moveCalendarItem(eventId, second.id, -1);
		expect((await listCalendarItems(eventId)).map((item) => item.name)).toEqual(["Elders Tuilagi & Brooks", "Elders Ramos & Chen"]);
	});

	it("validates names, capacity, glyphs, and times", async () => {
		const result = await saveCalendarItem(eventId, null, {
			name: "",
			capacity: 0,
			color: "blue",
			shape: "glyph",
			glyph: "!",
			times: [{ startTime: "23:30", durationMinutes: 60 }, { startTime: "nope", durationMinutes: 30 }]
		});
		expect(Object.keys(result.errors).sort()).toEqual(["capacity", "name", "shape", "times.0.durationMinutes", "times.1.startTime"]);
	});

	it("archives removed times instead of deleting them, and archives Items", async () => {
		const item = await addItem("Leading Volunteers", { times: [{ startTime: "09:00", durationMinutes: 60 }, { startTime: "14:00", durationMinutes: 60 }] });
		let [listed] = await listCalendarItems(eventId);
		expect(listed.times.map((time) => time.startTime)).toEqual(["09:00", "14:00"]);

		await saveCalendarItem(eventId, item.id, { ...item, times: [listed.times[1]] });
		[listed] = await listCalendarItems(eventId);
		expect(listed.times.map((time) => time.startTime)).toEqual(["14:00"]);
		expect((await sql`select count(*)::int as n from calendar_item_times where archived_at is not null`)[0].n).toBe(1);

		await archiveCalendarItem(eventId, item.id, true);
		expect((await listCalendarItems(eventId))[0].archived).toBe(true);
	});
});

describe("rules", () => {
	it("normalizes Applies to: none or all checked means All Items", async () => {
		const a = await addItem("A");
		const b = await addItem("B");
		const base = { effect: "block", kind: "recurring", frequency: "weekly", weekdays: [1] };
		expect((await saveCalendarRule(eventId, null, { ...base, appliesTo: "selected", itemIds: [] })).value.appliesTo).toBe("all");
		expect((await saveCalendarRule(eventId, null, { ...base, appliesTo: "selected", itemIds: [a.id, b.id] })).value.appliesTo).toBe("all");
		const some = await saveCalendarRule(eventId, null, { ...base, appliesTo: "selected", itemIds: [b.id] });
		expect(some.value).toMatchObject({ appliesTo: "selected", itemIds: [b.id] });
	});

	it("ignores Items from another event", async () => {
		const mine = await addItem("Mine");
		await addItem("Also mine");
		const otherEvent = await createTestEvent(owner.id);
		await createCalendar(otherEvent.id, { timeZone: "America/Denver" });
		const foreign = (await saveCalendarItem(otherEvent.id, null, { name: "Theirs", capacity: 1, color: "red", shape: "circle", times: [] })).value;
		const result = await saveCalendarRule(eventId, null, { effect: "block", kind: "once", onceDate: "2026-10-10", appliesTo: "selected", itemIds: [mine.id, foreign.id] });
		expect(result.value.itemIds).toEqual([mine.id]);
	});

	it("validates fields for the chosen kind and frequency", async () => {
		expect((await saveCalendarRule(eventId, null, { kind: "once" })).errors.onceDate).toBeTruthy();
		expect((await saveCalendarRule(eventId, null, { kind: "recurring", frequency: "weekly", weekdays: [] })).errors.weekdays).toBeTruthy();
		expect((await saveCalendarRule(eventId, null, { kind: "recurring", frequency: "biweekly", weekdays: [3] })).errors.startsOn).toBeTruthy();
		expect((await saveCalendarRule(eventId, null, { kind: "recurring", frequency: "monthly_weekday", monthWeek: 5, monthWeekday: 0 })).errors.monthWeek).toBeTruthy();
		expect((await saveCalendarRule(eventId, null, { kind: "recurring", frequency: "daily", startsOn: "2026-10-10", endsOn: "2026-10-01" })).errors.endsOn).toBeTruthy();
	});

	it("deactivates and hard-deletes rules", async () => {
		const rule = (await saveCalendarRule(eventId, null, { effect: "block", kind: "once", onceDate: "2026-10-10" })).value;
		await setCalendarRuleActive(eventId, rule.id, false);
		expect((await listCalendarRules(eventId))[0].active).toBe(false);
		await deleteCalendarRule(eventId, rule.id);
		expect(await listCalendarRules(eventId)).toEqual([]);
		expect((await sql`select count(*)::int as n from calendar_rule_items`)[0].n).toBe(0);
	});
});

describe("availability from stored data", () => {
	it("a Selected Items rule blocks exactly those Items (old bug regression)", async () => {
		const a = await addItem("A");
		const b = await addItem("B");
		await updateCalendarConfig(eventId, { windowMode: "fixed", fixedStart: "2030-01-01", fixedEnd: "2030-01-31" });
		await saveCalendarRule(eventId, null, { effect: "block", kind: "once", onceDate: "2030-01-15", appliesTo: "selected", itemIds: [b.id] });

		const context = await loadCalendarContext(eventId);
		const { window } = deriveContextWindow(context, new Date("2029-12-01T12:00:00Z"));
		const [day] = await resolveAvailabilityRange(context, { fromDate: "2030-01-15", toDate: "2030-01-15", window });
		const statusById = Object.fromEntries(day.items.map((entry) => [entry.itemId, entry.status]));
		expect(statusById[a.id]).toBe("available");
		expect(statusById[b.id]).toBe("blocked");
	});

	it("counts capacity from stored selections of active bookings only", async () => {
		const a = await addItem("A");
		await updateCalendarConfig(eventId, { windowMode: "fixed", fixedStart: "2030-01-01", fixedEnd: "2030-01-31" });
		const [booking] = await sql`insert into calendar_bookings (event_id, confirmation_ref, idempotency_key, name) values (${eventId}, 'ref-1', gen_random_uuid(), 'Pat') returning id`;
		await sql`insert into calendar_selections (event_id, booking_id, item_id, service_date, item_name) values (${eventId}, ${booking.id}, ${a.id}, '2030-01-10', 'A')`;

		const context = await loadCalendarContext(eventId);
		const { window } = deriveContextWindow(context, new Date("2029-12-01T12:00:00Z"));
		const read = async () => (await resolveAvailabilityRange(context, { fromDate: "2030-01-10", toDate: "2030-01-10", window }))[0].items[0].status;
		expect(await read()).toBe("full");
		await sql`update calendar_bookings set status = 'canceled' where id = ${booking.id}`;
		expect(await read()).toBe("available");
	});
});
