import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createCalendar, updateCalendarConfig } from "../../src/lib/server/services/calendarConfigService.js";
import { archiveCalendarItem, saveCalendarItem } from "../../src/lib/server/services/calendarItemService.js";
import { saveCalendarRule } from "../../src/lib/server/services/calendarRuleService.js";
import { createBooking, loadConfirmation } from "../../src/lib/server/services/calendarBookingService.js";
import { buildIcs, foldIcsLine } from "../../src/lib/server/ics.js";
import { clearAllTables, sql } from "../helpers/database.js";
import { createTestEvent, createTestUser } from "../helpers/factories.js";


const NOW = new Date("2029-12-01T12:00:00Z");
const PERSON = { name: "Jordan Whitaker", phone: "801-555-0123", contactMethod: "text", numberType: "cell" };

let event;
let owner;

beforeEach(async () => {
	await clearAllTables();
	owner = await createTestUser();
	event = await createTestEvent(owner.id);
	await createCalendar(event.id, { timeZone: "America/Denver" });
	await updateCalendarConfig(event.id, { status: "open", windowMode: "fixed", fixedStart: "2030-01-01", fixedEnd: "2030-01-31" });
});


async function addItem(name, overrides = {}) {

	return (await saveCalendarItem(event.id, null, { name, capacity: 1, color: "blue", shape: "circle", times: [], ...overrides })).value;
}

function book(selections, overrides = {}) {

	return createBooking(event, { ...PERSON, selections, idempotencyKey: crypto.randomUUID(), ...overrides }, { now: NOW });
}


describe("booking", () => {
	it("books several Items on several days in one submission, with snapshots", async () => {
		const a = await addItem("Elders Ramos & Chen");
		const b = await addItem("Elders Tuilagi & Brooks");
		const result = await book([{ itemId: a.id, date: "2030-01-10" }, { itemId: b.id, date: "2030-01-10" }, { itemId: a.id, date: "2030-01-11" }]);
		expect(result.ok).toBe(true);
		expect(result.value.reference).toMatch(/^[A-Za-z0-9_-]{43}$/);

		await saveCalendarItem(event.id, a.id, { ...a, name: "Renamed later", times: [] });
		const confirmation = await loadConfirmation(event.id, result.value.reference);
		expect(confirmation.selections.map((selection) => selection.itemName)).toEqual(["Elders Ramos & Chen", "Elders Tuilagi & Brooks", "Elders Ramos & Chen"]);
		expect(confirmation.booking.name).toBe("Jordan Whitaker");
	});

	it("never overbooks: the last spot goes to one of two simultaneous submissions", async () => {
		const a = await addItem("A");
		const results = await Promise.all([book([{ itemId: a.id, date: "2030-01-10" }]), book([{ itemId: a.id, date: "2030-01-10" }], { name: "Someone Else" })]);
		expect(results.filter((result) => result.ok)).toHaveLength(1);
		const loser = results.find((result) => !result.ok);
		expect(loser.errors.selections[0]).toMatchObject({ ok: false, reason: "taken" });
		expect((await sql`select count(*)::int as n from calendar_selections`)[0].n).toBe(1);
	});

	it("reports which selections failed and books nothing, so the rest can be resubmitted", async () => {
		const a = await addItem("A");
		const b = await addItem("B");
		expect((await book([{ itemId: a.id, date: "2030-01-10" }])).ok).toBe(true);
		const result = await book([{ itemId: a.id, date: "2030-01-10" }, { itemId: b.id, date: "2030-01-10" }]);
		expect(result.ok).toBe(false);
		expect(result.errors.selections.map((entry) => entry.ok)).toEqual([false, true]);
		const retry = await book([{ itemId: b.id, date: "2030-01-10" }]);
		expect(retry.ok).toBe(true);
	});

	it("deduplicates a double submission with the same idempotency key", async () => {
		const a = await addItem("A", { capacity: 5 });
		const key = crypto.randomUUID();
		const [first, second] = await Promise.all([
			book([{ itemId: a.id, date: "2030-01-10" }], { idempotencyKey: key }),
			book([{ itemId: a.id, date: "2030-01-10" }], { idempotencyKey: key })
		]);
		expect(first.value.reference).toBe(second.value.reference);
		expect((await sql`select count(*)::int as n from calendar_bookings`)[0].n).toBe(1);
	});

	it("refuses the same Item twice on one date, but allows it on different dates", async () => {
		const a = await addItem("A", { capacity: 5 });
		const twice = await book([{ itemId: a.id, date: "2030-01-10" }, { itemId: a.id, date: "2030-01-10" }]);
		expect(twice.errors.selections[1].reason).toBe("duplicate");
		expect((await book([{ itemId: a.id, date: "2030-01-10" }, { itemId: a.id, date: "2030-01-11" }])).ok).toBe(true);
	});

	it("rejects dates outside the window, blocked dates, and archived Items", async () => {
		const a = await addItem("A");
		const archived = await addItem("Archived");
		await archiveCalendarItem(event.id, archived.id, true);
		await saveCalendarRule(event.id, null, { effect: "block", kind: "once", onceDate: "2030-01-15" });
		const result = await book([{ itemId: a.id, date: "2030-02-01" }, { itemId: a.id, date: "2030-01-15" }, { itemId: archived.id, date: "2030-01-10" }]);
		expect(result.errors.selections.map((entry) => entry.reason)).toEqual(["closed", "closed", "closed"]);
	});

	it("can't book another event's Items", async () => {
		const otherEvent = await createTestEvent(owner.id);
		await createCalendar(otherEvent.id, { timeZone: "America/Denver" });
		const foreign = (await saveCalendarItem(otherEvent.id, null, { name: "Theirs", capacity: 1, color: "red", shape: "circle", times: [] })).value;
		const result = await book([{ itemId: foreign.id, date: "2030-01-10" }]);
		expect(result.errors.selections[0].reason).toBe("invalid");
	});

	it("validates the signup form per setup", async () => {
		const a = await addItem("A");
		const result = await book([{ itemId: a.id, date: "2030-01-10" }], { name: " ", phone: "123" });
		expect(result.errors).toMatchObject({ name: expect.any(String), phone: expect.any(String) });
		await updateCalendarConfig(event.id, { formFields: { phone: { on: false }, email: { on: true, required: true }, notes: { on: false } } });
		const noEmail = await book([{ itemId: a.id, date: "2030-01-10" }], { phone: "" });
		expect(noEmail.errors.email).toBeTruthy();
	});

	it("refuses bookings while the calendar is closed", async () => {
		const a = await addItem("A");
		await updateCalendarConfig(event.id, { status: "closed" });
		expect((await book([{ itemId: a.id, date: "2030-01-10" }])).code).toBe("conflict");
	});
});

describe("timed booking", () => {
	beforeEach(async () => {
		await updateCalendarConfig(event.id, { timed: true, preventOverlap: true });
	});

	it("counts capacity per time and blocks overlaps on the same day only", async () => {
		const leading = await addItem("Leading", { capacity: 2, times: [{ startTime: "09:00", durationMinutes: 60 }, { startTime: "14:00", durationMinutes: 60 }] });
		const design = await addItem("Design", { capacity: 2, times: [{ startTime: "09:30", durationMinutes: 90 }] });
		const [times] = await sql`select array_agg(id order by start_time) as ids from calendar_item_times where item_id = ${leading.id}`;
		const [designTime] = await sql`select id from calendar_item_times where item_id = ${design.id}`;

		const overlap = await book([{ itemId: leading.id, date: "2030-01-10", timeId: times.ids[0] }, { itemId: design.id, date: "2030-01-10", timeId: designTime.id }]);
		expect(overlap.errors.selections[1]).toMatchObject({ reason: "overlap" });
		expect(overlap.errors.selections[1].message).toMatch(/9:00 am/);

		const differentDays = await book([{ itemId: leading.id, date: "2030-01-10", timeId: times.ids[0] }, { itemId: design.id, date: "2030-01-11", timeId: designTime.id }]);
		expect(differentDays.ok).toBe(true);
		const sameItemTwoTimes = await book([{ itemId: leading.id, date: "2030-01-12", timeId: times.ids[0] }, { itemId: leading.id, date: "2030-01-12", timeId: times.ids[1] }]);
		expect(sameItemTwoTimes.ok).toBe(true);
	});

	it("allows date-only Items (no times) together with timed ones", async () => {
		const timedItem = await addItem("Session", { times: [{ startTime: "09:00", durationMinutes: 60 }] });
		const allDay = await addItem("Service Project");
		const [time] = await sql`select id from calendar_item_times where item_id = ${timedItem.id}`;
		expect((await book([{ itemId: timedItem.id, date: "2030-01-10", timeId: time.id }, { itemId: allDay.id, date: "2030-01-10" }])).ok).toBe(true);
	});

	it("requires a valid time for Items that have times", async () => {
		const timedItem = await addItem("Session", { times: [{ startTime: "09:00", durationMinutes: 60 }] });
		expect((await book([{ itemId: timedItem.id, date: "2030-01-10" }])).errors.selections[0].reason).toBe("invalid");
	});

	it("keeps bookings readable after their time is removed, and stops offering it", async () => {
		const timedItem = await addItem("Session", { times: [{ startTime: "09:00", durationMinutes: 60 }] });
		const [time] = await sql`select id from calendar_item_times where item_id = ${timedItem.id}`;
		const booked = await book([{ itemId: timedItem.id, date: "2030-01-10", timeId: time.id }]);
		await saveCalendarItem(event.id, timedItem.id, { ...timedItem, times: [] });
		const confirmation = await loadConfirmation(event.id, booked.value.reference);
		expect(confirmation.selections[0]).toMatchObject({ startTime: "09:00", durationMinutes: 60 });
		expect((await book([{ itemId: timedItem.id, date: "2030-01-11", timeId: time.id }])).errors.selections[0].reason).toBe("invalid");
	});
});

describe("confirmation references and calendar files", () => {
	it("references are unguessable and scoped to their event", async () => {
		const a = await addItem("A", { capacity: 10 });
		const references = [];
		for (let index = 0; index < 5; index += 1) {
			references.push((await book([{ itemId: a.id, date: `2030-01-1${index}` }])).value.reference);
		}
		expect(new Set(references).size).toBe(5);
		expect(await loadConfirmation(event.id, "short")).toBeNull();
		const otherEvent = await createTestEvent(owner.id);
		expect(await loadConfirmation(otherEvent.id, references[0])).toBeNull();
	});

	it("builds combined and separate ICS files in UTC with folding", () => {
		const selections = [
			{ itemName: "Leading, Volunteers", date: "2030-01-10", startTime: "09:00", durationMinutes: 60 },
			{ itemName: "Budget", date: "2030-01-10", startTime: "14:00", durationMinutes: 30 }
		];
		const base = { eventName: "Summit", calendarTitle: "Breakouts", timeZone: "America/Denver", reference: "ref", confirmationUrl: "https://progr.am/x/calendar/confirmation/ref", selections, now: NOW };
		const combined = buildIcs({ ...base, mode: "combined" });
		expect(combined).toContain("DTSTART:20300110T160000Z");
		expect(combined).toContain("DTEND:20300110T213000Z");
		expect(combined.match(/BEGIN:VEVENT/g)).toHaveLength(1);
		expect(combined).toContain("Leading\\, Volunteers");
		const separate = buildIcs({ ...base, mode: "separate" });
		expect(separate.match(/BEGIN:VEVENT/g)).toHaveLength(2);
		const allDay = buildIcs({ ...base, mode: "combined", selections: [{ itemName: "Meal", date: "2030-01-31", startTime: null, durationMinutes: null }] });
		expect(allDay).toContain("DTSTART;VALUE=DATE:20300131");
		expect(allDay).toContain("DTEND;VALUE=DATE:20300201");
		expect(foldIcsLine("x".repeat(160)).split("\r\n ").every((part) => part.length <= 75)).toBe(true);
	});
});
