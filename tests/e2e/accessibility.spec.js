/*
	Automated WCAG 2.1 AA checks (axe) on the main public and organizer pages,
	in both themes. Axe catches contrast, labels, roles, and landmark issues;
	keyboard flow and focus order are covered by the flow tests.
*/
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { buildUniqueCode, callApi, createEventThroughUi, seedCalendar, signUpThroughUi } from "./helpers.js";


const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const THEMES = ["dark", "light"];
const DAY_MS = 24 * 60 * 60 * 1000;


function buildDateFromToday(offsetDays) {

	return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offsetDays * DAY_MS));
}

async function expectNoViolations(page, path) {

	await page.goto(path);
	await page.waitForLoadState("networkidle");
	const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
	const summary = results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
	expect(summary, `${path}`).toEqual([]);
}


for (const theme of THEMES) {
	test(`main pages pass axe in the ${theme} theme`, async ({ page, context }) => {
		test.setTimeout(120000);
		await context.addCookies([{ name: "progr_theme", value: theme, url: "http://localhost:4173" }]);
		await expectNoViolations(page, "/login");
		await expectNoViolations(page, "/signup");

		await signUpThroughUi(page);
		const code = buildUniqueCode("a11y");
		const eventId = await createEventThroughUi(page, { name: "Elm Ward", code });
		const [ramos] = await seedCalendar(page, eventId, {
			config: { windowMode: "fixed", fixedStart: buildDateFromToday(1), fixedEnd: buildDateFromToday(20), formFields: { phone: { on: true }, email: { on: true }, notes: { on: true } } },
			items: [{ name: "Elders Ramos & Chen", color: "blue", shape: "circle" }, { name: "Sisters Park & Moreau", color: "pink", shape: "diamond" }]
		});
		const booking = await callApi(page, "POST", `/api/public/${code}/calendar/bookings`, { name: "Maya Castillo", phone: "801-555-0123", email: "", notes: "", idempotencyKey: crypto.randomUUID(), selections: [{ itemId: ramos.id, date: buildDateFromToday(2), timeId: null }] });
		expect(booking.status).toBe(201);

		const organizerPaths = ["/dashboard", "/account", "program", "settings", "calendar", "calendar/setup", "calendar/items", "calendar/availability", "calendar/bookings", "calendar/export"];
		for (const path of organizerPaths) {
			await expectNoViolations(page, path.startsWith("/") ? path : `/events/${eventId}/${path}`);
		}
		await expectNoViolations(page, `/${code}/calendar`);
		expect(Object.keys(booking.data).sort()).toEqual(["ok", "reference"]);
		await expectNoViolations(page, `/${code}/calendar/confirmation/${booking.data.reference}`);
		await expectNoViolations(page, `/${code}`);
	});
}
