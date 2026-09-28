import { expect, test } from "@playwright/test";
import { buildUniqueCode, callApi, createEventThroughUi, seedCalendar, signUpThroughUi } from "./helpers.js";


const DAY_MS = 24 * 60 * 60 * 1000;


function buildDateFromToday(offsetDays) {

	return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offsetDays * DAY_MS));
}

async function pickDateInDrawer(drawer, date) {

	await drawer.getByRole("button", { name: "Date 1" }).click();
	const picker = drawer.getByRole("dialog", { name: "Choose a date" });
	const MONTHS_TO_TRY = 3;
	for (let attempt = 0; attempt < MONTHS_TO_TRY && !await picker.locator(`[data-date="${date}"]`).count(); attempt += 1) {
		await picker.getByRole("button", { name: "Next month" }).click();
	}
	await picker.locator(`[data-date="${date}"]`).click();
}

async function setUpWithBookings(page) {

	await signUpThroughUi(page);
	const code = buildUniqueCode("admin");
	const eventId = await createEventThroughUi(page, { name: "Elm Ward", code });
	const [ramos, park] = await seedCalendar(page, eventId, {
		config: { windowMode: "fixed", fixedStart: buildDateFromToday(1), fixedEnd: buildDateFromToday(14), formFields: { phone: { on: true }, contactMethod: { on: true }, numberType: { on: true }, email: { on: true }, notes: { on: true } } },
		items: [{ name: "Elders Ramos & Chen", color: "blue", shape: "circle" }, { name: "Sisters Park & Moreau", color: "pink", shape: "diamond" }]
	});
	const book = async (name, selections, extra = {}) => {
		const result = await callApi(page, "POST", `/api/public/${code}/calendar/bookings`, { name, phone: "801-555-0123", contactMethod: "text", numberType: "whatsapp", email: "someone@example.com", notes: "", idempotencyKey: crypto.randomUUID(), selections, ...extra });
		expect(result.status).toBe(201);
	};
	await book("Maya Castillo", [{ itemId: ramos.id, date: buildDateFromToday(2), timeId: null }], { notes: "Peanut allergy" });
	await book("Sione Fifita", [{ itemId: ramos.id, date: buildDateFromToday(3), timeId: null }, { itemId: park.id, date: buildDateFromToday(3), timeId: null }]);
	return { code, eventId };
}


test.describe("organizer bookings", () => {
	test("the table shows the required columns, latest booked date first", async ({ page }) => {
		const { eventId } = await setUpWithBookings(page);
		await page.goto(`/events/${eventId}/calendar/bookings`);
		const headers = await page.locator("table.bookings-table thead th").allInnerTexts();
		expect(headers.map((text) => text.trim()).slice(0, 6)).toEqual(["Date", "Item(s)", "Name", "Phone", "Contact", "WhatsApp"]);
		const names = await page.locator("table.bookings-table tbody .table__name").allInnerTexts();
		expect(names).toEqual(["Sione Fifita", "Maya Castillo"]);
		await expect(page.getByRole("row", { name: /Maya Castillo/ }).getByRole("img", { name: "Has notes" })).toBeVisible();
		await expect(page.getByRole("row", { name: /Sione Fifita/ }).getByText("Sisters Park & Moreau")).toBeVisible();
	});

	test("reschedule is refused into a full date, allowed into an open one, and logged", async ({ page }) => {
		const { eventId } = await setUpWithBookings(page);
		await page.goto(`/events/${eventId}/calendar/bookings`);
		await page.getByRole("link", { name: "Maya Castillo", exact: true }).click();
		await page.getByRole("button", { name: "Edit", exact: true }).click();

		const drawer = page.getByRole("dialog", { name: "Edit booking" });
		await pickDateInDrawer(drawer, buildDateFromToday(3));
		await drawer.getByRole("button", { name: "Save changes" }).click();
		await expect(drawer.getByText("Someone else just took this spot.")).toBeVisible();

		await pickDateInDrawer(drawer, buildDateFromToday(5));
		await drawer.getByRole("button", { name: "Save changes" }).click();
		await expect(page.getByRole("status")).toContainText("Booking saved");
		await expect(page.getByText(/Edited by Test Organizer/)).toBeVisible();
	});

	test("cancel asks first, frees the spot, and can be undone", async ({ page }) => {
		const { eventId } = await setUpWithBookings(page);
		await page.goto(`/events/${eventId}/calendar/bookings`);
		await page.getByRole("link", { name: "Maya Castillo", exact: true }).click();
		await page.getByRole("button", { name: "Cancel booking" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Cancel booking" }).click();
		await expect(page.getByText("Canceled", { exact: true }).first()).toBeVisible();
		await page.getByRole("button", { name: "Undo" }).click();
		await expect(page.getByRole("status")).toContainText("Booking restored");
		await expect(page.getByText("Active", { exact: true })).toBeVisible();
	});
});

test.describe("export", () => {
	test("the preview shows exactly the exported columns, and names-only never leaks contact details", async ({ page }) => {
		const { eventId } = await setUpWithBookings(page);
		await page.goto(`/events/${eventId}/calendar/export`);
		const preview = page.getByRole("region", { name: "Preview" });
		await expect(preview.getByRole("columnheader", { name: "Phone" })).toBeVisible();
		await expect(preview.getByText("801-555-0123").first()).toBeVisible();

		await page.getByRole("radio", { name: /Names only/ }).click();
		await expect(page.getByText("Include", { exact: true })).toHaveCount(0);
		await expect(preview.getByRole("columnheader", { name: "Phone" })).toHaveCount(0);
		await expect(preview.getByText("801-555-0123")).toHaveCount(0);

		const download = page.waitForEvent("download");
		await page.getByRole("button", { name: "Download CSV" }).click();
		const file = await download;
		expect(file.suggestedFilename()).toMatch(/signups-\d{4}-\d{2}-\d{2}\.csv$/);
		const text = await (await file.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString("utf8"));
		expect(text).toContain("Date,Time,Item,Name");
		expect(text).not.toContain("801-555-0123");
	});
});
