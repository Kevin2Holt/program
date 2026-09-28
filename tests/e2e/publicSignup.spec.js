import { expect, test } from "@playwright/test";
import { buildUniqueCode, callApi, createEventThroughUi, seedCalendar, signUpThroughUi } from "./helpers.js";


const TIME_ZONE = "America/Denver";
const DAY_MS = 24 * 60 * 60 * 1000;


function buildDateFromToday(offsetDays) {

	return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offsetDays * DAY_MS));
}

async function setUpMealsCalendar(page, options = {}) {

	await signUpThroughUi(page);
	const code = buildUniqueCode("meals");
	const eventId = await createEventThroughUi(page, { name: "Elm Ward", code });
	const items = await seedCalendar(page, eventId, {
		config: { title: "Missionary meals", windowMode: "fixed", fixedStart: buildDateFromToday(1), fixedEnd: buildDateFromToday(10), ...options.config },
		items: options.items || [
			{ name: "Elders Ramos & Chen", color: "blue", shape: "circle" },
			{ name: "Sisters Park & Moreau", color: "pink", shape: "diamond" }
		]
	});
	return { code, eventId, items };
}

async function openFirstAvailableDay(page) {

	const day = page.locator("button.cal-day").first();
	await day.click();
	return day.getAttribute("data-date");
}


test.describe("public signup (date-only)", () => {
	test("pick, remove, and book several Items; the confirmation shows a full link and a calendar file", async ({ page, browser }) => {
		const { code } = await setUpMealsCalendar(page);
		const visitor = await browser.newPage();
		await visitor.goto(`/${code}/calendar`);
		await expect(visitor.getByRole("heading", { name: "Missionary meals" })).toBeVisible();

		const date = await openFirstAvailableDay(visitor);
		const dayCell = visitor.locator(`button.cal-day[data-date="${date}"]`);
		await expect(dayCell.locator(".marker")).toHaveCount(2);
		await visitor.getByRole("button", { name: "Add Elders Ramos & Chen" }).click();

		// Picked: gone from the panel and the day's markers, present in the summary.
		await expect(visitor.getByRole("button", { name: "Add Elders Ramos & Chen" })).toHaveCount(0);
		await expect(dayCell.locator(".marker")).toHaveCount(1);
		const summary = visitor.getByRole("region", { name: "Your selections" });
		await expect(summary.getByText("Elders Ramos & Chen")).toBeVisible();
		await expect(visitor.locator(".day-panel")).toBeVisible();

		// Removing restores both.
		await summary.getByRole("button", { name: /Remove Elders Ramos & Chen/ }).click();
		await expect(visitor.getByRole("button", { name: "Add Elders Ramos & Chen" })).toBeVisible();
		await expect(dayCell.locator(".marker")).toHaveCount(2);

		await visitor.getByRole("button", { name: "Add Elders Ramos & Chen" }).click();
		await visitor.getByRole("button", { name: "Add Sisters Park & Moreau" }).click();
		await expect(visitor.getByText("You've picked everything open on this day.")).toBeVisible();
		await summary.getByRole("button", { name: "Continue" }).click();

		await expect(visitor.getByRole("heading", { name: "Almost done" })).toBeVisible();
		await visitor.getByRole("button", { name: /Sign up for 2 spots/ }).click();
		await expect(visitor.getByText("Enter your name.")).toBeVisible();
		await visitor.getByLabel("Name").fill("Jordan Whitaker");
		await visitor.getByLabel("Phone").fill("801-555-0123");
		await visitor.getByRole("radio", { name: "Text" }).click();
		await visitor.getByRole("button", { name: /Sign up for 2 spots/ }).click();

		await expect(visitor).toHaveURL(new RegExp(`/${code}/calendar/confirmation/[A-Za-z0-9_-]{43}$`));
		await expect(visitor.getByRole("heading", { name: "You're signed up, Jordan" })).toBeVisible();
		await expect(visitor.getByRole("link", { name: new RegExp(`^https://progr\\.am/${code}/calendar/confirmation/`) })).toBeVisible();
		const icsHref = await visitor.getByRole("link", { name: "Add to my calendar" }).getAttribute("href");
		const ics = await visitor.request.get(icsHref);
		expect(ics.headers()["content-type"]).toContain("text/calendar");
		expect(await ics.text()).toContain("BEGIN:VEVENT");

		// Back on the calendar, both Items are gone from that day.
		await visitor.goto(`/${code}/calendar`);
		await expect(visitor.locator(`button.cal-day[data-date="${date}"]`)).toHaveCount(0);
		await visitor.close();
	});

	test("when a spot is taken meanwhile, the page explains it and keeps the other selections", async ({ page, browser }) => {
		const { code } = await setUpMealsCalendar(page);
		const first = await browser.newPage();
		const second = await browser.newPage();
		for (const visitor of [first, second]) {
			await visitor.goto(`/${code}/calendar`);
			await openFirstAvailableDay(visitor);
		}
		await second.getByRole("button", { name: "Add Elders Ramos & Chen" }).click();
		await second.getByRole("button", { name: "Add Sisters Park & Moreau" }).click();
		await second.getByRole("region", { name: "Your selections" }).getByRole("button", { name: "Continue" }).click();

		await first.getByRole("button", { name: "Add Elders Ramos & Chen" }).click();
		await first.getByRole("region", { name: "Your selections" }).getByRole("button", { name: "Continue" }).click();
		await first.getByLabel("Name").fill("First Person");
		await first.getByLabel("Phone").fill("801-555-0100");
		await first.getByRole("button", { name: /Sign up for 1 spot/ }).click();
		await expect(first.getByRole("heading", { name: /You're signed up/ })).toBeVisible();

		await second.getByLabel("Name").fill("Second Person");
		await second.getByLabel("Phone").fill("801-555-0101");
		await second.getByRole("button", { name: /Sign up for 2 spots/ }).click();
		await expect(second.getByRole("alert").filter({ hasText: "isn't available anymore" })).toContainText("Elders Ramos & Chen");
		await expect(second.getByText("Your other selections are still here.")).toBeVisible();
		await second.getByRole("button", { name: /Sign up for 1 spot/ }).click();
		await expect(second.getByRole("heading", { name: /You're signed up, Second/ })).toBeVisible();
		await first.close();
		await second.close();
	});

	test("hiding an Item with a filter never removes it from the selections", async ({ page, browser }) => {
		const { code } = await setUpMealsCalendar(page);
		const visitor = await browser.newPage();
		await visitor.goto(`/${code}/calendar`);
		await openFirstAvailableDay(visitor);
		await visitor.getByRole("button", { name: "Add Elders Ramos & Chen" }).click();
		await visitor.getByRole("group", { name: "Show or hide items" }).getByRole("button", { name: "Elders Ramos & Chen" }).click();
		await expect(visitor.getByRole("region", { name: "Your selections" }).getByText("Elders Ramos & Chen")).toBeVisible();
		await expect(visitor.locator("button.cal-day .marker[data-color=blue]")).toHaveCount(0);
		await visitor.close();
	});

	test("draft calendars are hidden; closed ones say so; the program links to open ones", async ({ page, browser }) => {
		const { code, eventId } = await setUpMealsCalendar(page);
		const visitor = await browser.newPage();

		await callApi(page, "PATCH", `/api/events/${eventId}/calendar/config`, { changes: { status: "draft" } });
		expect((await visitor.goto(`/${code}/calendar`)).status()).toBe(404);

		await callApi(page, "PATCH", `/api/events/${eventId}/calendar/config`, { changes: { status: "closed" } });
		await visitor.goto(`/${code}/calendar`);
		await expect(visitor.getByText("Signups are closed", { exact: true })).toBeVisible();

		await callApi(page, "PATCH", `/api/events/${eventId}/calendar/config`, { changes: { status: "open" } });
		await visitor.goto(`/${code}`);
		await expect(visitor.getByRole("link", { name: "Sign up" })).toBeVisible();
		await visitor.close();
	});
});

test.describe("public signup (timed)", () => {
	test("times appear in the panel, and overlapping times on the same day can't be picked", async ({ page, browser }) => {
		const { code } = await setUpMealsCalendar(page, {
			config: { title: "Breakouts", timed: true, preventOverlap: true },
			items: [
				{ name: "Leading Volunteers", color: "blue", shape: "circle", capacity: 20, times: [{ startTime: "09:00", durationMinutes: 60 }, { startTime: "14:00", durationMinutes: 60 }] },
				{ name: "Design Thinking Lab", color: "pink", shape: "star", capacity: 20, times: [{ startTime: "09:30", durationMinutes: 90 }] }
			]
		});
		const visitor = await browser.newPage();
		await visitor.goto(`/${code}/calendar`);
		await expect(visitor.getByText(/Times are in .*America\/Denver/)).toBeVisible();
		const date = await openFirstAvailableDay(visitor);
		await expect(visitor.locator(`button.cal-day[data-date="${date}"] .marker`)).toHaveCount(3);

		await visitor.getByRole("button", { name: "Add Leading Volunteers, 9:00 am – 10:00 am" }).click();
		const overlapping = visitor.getByRole("button", { name: /Design Thinking Lab.*overlaps your 9:00 am selection/ });
		await expect(overlapping).toHaveAttribute("aria-disabled", "true");
		await visitor.getByRole("button", { name: "Add Leading Volunteers, 2:00 pm – 3:00 pm" }).click();

		await visitor.getByRole("region", { name: "Your selections" }).getByRole("button", { name: "Continue" }).click();
		await visitor.getByLabel("Name").fill("Pat Session");
		await visitor.getByLabel("Phone").fill("801-555-0199");
		await visitor.getByRole("button", { name: /Sign up for 2 spots/ }).click();
		await expect(visitor.getByRole("heading", { name: /You're signed up, Pat/ })).toBeVisible();
		await expect(visitor.getByText("9:00 am – 10:00 am")).toBeVisible();
		await visitor.close();
	});
});
