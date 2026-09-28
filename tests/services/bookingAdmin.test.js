import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createCalendar, updateCalendarConfig } from "../../src/lib/server/services/calendarConfigService.js";
import { saveCalendarItem } from "../../src/lib/server/services/calendarItemService.js";
import { saveCalendarRule } from "../../src/lib/server/services/calendarRuleService.js";
import { createBooking } from "../../src/lib/server/services/calendarBookingService.js";
import { cancelBooking, listBookingsPage, loadBookingDetails, restoreBooking, updateBooking } from "../../src/lib/server/services/calendarBookingAdminService.js";
import { buildExport, escapeCsvCell } from "../../src/lib/server/services/calendarExportService.js";
import { clearAllTables, sql } from "../helpers/database.js";
import { createTestEvent, createTestUser } from "../helpers/factories.js";


const NOW = new Date("2029-12-01T12:00:00Z");

let event;
let owner;
let itemA;
let itemB;

beforeEach(async () => {
	await clearAllTables();
	owner = await createTestUser();
	event = await createTestEvent(owner.id);
	await createCalendar(event.id, { timeZone: "America/Denver" });
	await updateCalendarConfig(event.id, { status: "open", windowMode: "fixed", fixedStart: "2030-01-01", fixedEnd: "2030-01-31", formFields: { phone: { on: true }, contactMethod: { on: true }, numberType: { on: true }, email: { on: true }, notes: { on: true } } });
	itemA = (await saveCalendarItem(event.id, null, { name: "Ramos", capacity: 1, color: "blue", shape: "circle", times: [] })).value;
	itemB = (await saveCalendarItem(event.id, null, { name: "Tuilagi", capacity: 1, color: "amber", shape: "triangle", times: [] })).value;
});


async function book(name, selections, extra = {}) {

	const result = await createBooking(event, { name, phone: "801-555-0123", contactMethod: "text", numberType: "whatsapp", email: `${name.split(" ")[0].toLowerCase()}@example.com`, notes: "", selections, idempotencyKey: crypto.randomUUID(), ...extra }, { now: NOW });
	expect(result.ok).toBe(true);
	const [row] = await sql`select id from calendar_bookings where confirmation_ref = ${result.value.reference}`;
	return row.id;
}

function buildEditInput(details, selections, overrides = {}) {

	const { booking } = details;
	return { name: booking.name, phone: booking.phone, contactMethod: booking.contactMethod, numberType: booking.numberType, email: booking.email, notes: booking.notes, selections, ...overrides };
}


describe("bookings table", () => {
	it("lists one row per booking per date, latest date first, with Items grouped", async () => {
		await book("Ann", [{ itemId: itemA.id, date: "2030-01-10" }, { itemId: itemB.id, date: "2030-01-10" }, { itemId: itemA.id, date: "2030-01-12" }]);
		await book("Ben", [{ itemId: itemB.id, date: "2030-01-11" }]);
		const page = await listBookingsPage(event.id, {});
		expect(page.rows.map((row) => [row.date, row.name, row.selections.length])).toEqual([["2030-01-12", "Ann", 1], ["2030-01-11", "Ben", 1], ["2030-01-10", "Ann", 2]]);
		expect(page.rows[2].numberType).toBe("whatsapp");
		expect((await listBookingsPage(event.id, { sort: "asc" })).rows[0].date).toBe("2030-01-10");
		expect((await listBookingsPage(event.id, { item: String(itemB.id) })).rows.map((row) => row.name)).toEqual(["Ben", "Ann"]);
		expect((await listBookingsPage(event.id, { q: "ben" })).rows).toHaveLength(1);
	});
});

describe("organizer edits", () => {
	it("reschedules into an open date and logs the change", async () => {
		const bookingId = await book("Ann Lee", [{ itemId: itemA.id, date: "2030-01-10" }]);
		const details = await loadBookingDetails(event.id, bookingId);
		const result = await updateBooking(event.id, bookingId, buildEditInput(details, [{ itemId: itemA.id, date: "2030-01-15" }]), owner.id);
		expect(result.ok).toBe(true);
		const after = await loadBookingDetails(event.id, bookingId);
		expect(after.selections.map((selection) => selection.date)).toEqual(["2030-01-15"]);
		expect(after.log[0]).toMatchObject({ action: "edited", actorName: owner.displayName });
		expect(after.log[0].detail.added[0]).toMatch(/Ramos, Tue, Jan 15/);
	});

	it("refuses to move a booking into a full or blocked target, explaining why", async () => {
		await book("Ben", [{ itemId: itemA.id, date: "2030-01-15" }]);
		await saveCalendarRule(event.id, null, { effect: "block", kind: "once", onceDate: "2030-01-16" });
		const bookingId = await book("Ann Lee", [{ itemId: itemA.id, date: "2030-01-10" }]);
		const details = await loadBookingDetails(event.id, bookingId);
		const full = await updateBooking(event.id, bookingId, buildEditInput(details, [{ itemId: itemA.id, date: "2030-01-15" }]), owner.id);
		expect(full.errors.selections[0]).toMatchObject({ ok: false, reason: "taken" });
		const blocked = await updateBooking(event.id, bookingId, buildEditInput(details, [{ itemId: itemA.id, date: "2030-01-16" }]), owner.id);
		expect(blocked.errors.selections[0].reason).toBe("closed");
		expect((await loadBookingDetails(event.id, bookingId)).selections[0].date).toBe("2030-01-10");
	});

	it("refuses overlapping timed edits", async () => {
		await updateCalendarConfig(event.id, { timed: true });
		const session = (await saveCalendarItem(event.id, null, { name: "Session", capacity: 5, color: "teal", shape: "square", times: [{ startTime: "09:00", durationMinutes: 60 }, { startTime: "09:30", durationMinutes: 60 }] })).value;
		const times = await sql`select id from calendar_item_times where item_id = ${session.id} order by start_time`;
		const bookingId = await book("Ann Lee", [{ itemId: session.id, date: "2030-01-10", timeId: times[0].id }]);
		const details = await loadBookingDetails(event.id, bookingId);
		const result = await updateBooking(event.id, bookingId, buildEditInput(details, [{ itemId: session.id, date: "2030-01-10", timeId: times[0].id }, { itemId: session.id, date: "2030-01-10", timeId: times[1].id }]), owner.id);
		expect(result.errors.selections[1].reason).toBe("overlap");
	});

	it("keeps unchanged selections even if their date is now out of the window or blocked", async () => {
		const bookingId = await book("Ann Lee", [{ itemId: itemA.id, date: "2030-01-10" }]);
		await saveCalendarRule(event.id, null, { effect: "block", kind: "once", onceDate: "2030-01-10" });
		const details = await loadBookingDetails(event.id, bookingId);
		expect((await updateBooking(event.id, bookingId, buildEditInput(details, [{ itemId: itemA.id, date: "2030-01-10" }], { notes: "Bringing dessert" }), owner.id)).ok).toBe(true);
		expect((await loadBookingDetails(event.id, bookingId)).booking.notes).toBe("Bringing dessert");
	});

	it("cancel frees the spot; restore only works while the spot is still free", async () => {
		const bookingId = await book("Ann Lee", [{ itemId: itemA.id, date: "2030-01-10" }]);
		await cancelBooking(event.id, bookingId, owner.id);
		expect((await restoreBooking(event.id, bookingId, owner.id)).ok).toBe(true);
		await cancelBooking(event.id, bookingId, owner.id);
		await book("Ben", [{ itemId: itemA.id, date: "2030-01-10" }]);
		const blocked = await restoreBooking(event.id, bookingId, owner.id);
		expect(blocked.ok).toBe(false);
		expect(blocked.message).toMatch(/Ramos/);
		expect((await listBookingsPage(event.id, { when: "canceled" })).rows).toHaveLength(1);
	});

	it("never touches another event's bookings", async () => {
		const bookingId = await book("Ann Lee", [{ itemId: itemA.id, date: "2030-01-10" }]);
		const otherEvent = await createTestEvent(owner.id);
		expect(await loadBookingDetails(otherEvent.id, bookingId)).toBeNull();
		expect((await cancelBooking(otherEvent.id, bookingId, owner.id)).ok).toBe(false);
	});
});

describe("export", () => {
	beforeEach(async () => {
		await book("Ann Lee", [{ itemId: itemA.id, date: "2030-01-10" }, { itemId: itemB.id, date: "2030-01-10" }], { notes: "=HYPERLINK(\"evil\")" });
		await book("Ben Ode", [{ itemId: itemB.id, date: "2030-01-11" }]);
	});

	it("count only: no names or contact details at all", async () => {
		const result = await buildExport(event.id, { detail: "count", range: "all", fields: ["phone", "email"] });
		expect(result.value.header).toEqual(["Date", "Time", "Item", "Signups"]);
		expect(result.value.csv).not.toMatch(/Ann|Ben|801-555|example\.com/);
	});

	it("names only never includes contact fields, even if they were requested", async () => {
		const result = await buildExport(event.id, { detail: "names", range: "all", fields: ["phone", "email", "notes"] });
		expect(result.value.header).toEqual(["Date", "Time", "Item", "Name"]);
		expect(result.value.csv).not.toMatch(/801-555|example\.com|HYPERLINK/);
	});

	it("count + names groups by offering", async () => {
		const result = await buildExport(event.id, { detail: "count_names", range: "all" });
		expect(result.value.rows).toEqual([["2030-01-10", "", "Ramos", 1, "Ann Lee"], ["2030-01-10", "", "Tuilagi", 1, "Ann Lee"], ["2030-01-11", "", "Tuilagi", 1, "Ben Ode"]]);
	});

	it("names + contact includes exactly the chosen fields, with formulas neutralized", async () => {
		const result = await buildExport(event.id, { detail: "contact", range: "all", fields: ["numberType", "notes"] });
		expect(result.value.header).toEqual(["Date", "Time", "Item", "Name", "Number type", "Notes"]);
		expect(result.value.csv).not.toMatch(/801-555|example\.com/);
		expect(result.value.csv).toContain("\"'=HYPERLINK(\"\"evil\"\")\"");
		expect(result.value.csv).toContain("WhatsApp");
	});

	it("filters by Item and date range", async () => {
		const byItem = await buildExport(event.id, { detail: "names", range: "all", itemIds: [itemB.id] });
		expect(byItem.value.rows.map((row) => row[3])).toEqual(["Ann Lee", "Ben Ode"]);
		const byRange = await buildExport(event.id, { detail: "names", range: "custom", fromDate: "2030-01-11", toDate: "2030-01-31" });
		expect(byRange.value.rows.map((row) => row[3])).toEqual(["Ben Ode"]);
		expect((await buildExport(event.id, { detail: "names", range: "custom", fromDate: "2030-01-20", toDate: "2030-01-11" })).ok).toBe(false);
	});

	it("escapes CSV cells", () => {
		expect(escapeCsvCell("plain")).toBe("plain");
		expect(escapeCsvCell("a,b")).toBe("\"a,b\"");
		expect(escapeCsvCell("-1+2")).toBe("'-1+2");
		expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
		expect(escapeCsvCell("line\nbreak")).toBe("\"line\nbreak\"");
	});
});
