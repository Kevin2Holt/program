/*
	Screenshot pass for visual review: every screen, both themes, phone and
	desktop widths. Output: test-results/screens/<screen>-<theme>-<width>.png
	Then: node scripts/screen-sheets.js builds one review sheet per screen.
*/
import { test } from "@playwright/test";
import { seedCalendar, signUpThroughUi } from "../e2e/helpers.js";


const WIDTHS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 820 } };
const THEMES = ["dark", "light"];
const OUTPUT_DIR = "test-results/screens";
const SETTLE_MS = 400;


async function captureScreen(page, screen, theme, widthName) {

	await page.setViewportSize(WIDTHS[widthName]);
	await page.context().addCookies([{ name: "progr_theme", value: theme, url: "http://localhost:4173" }]);
	await page.goto(screen.path);
	if (screen.prepare) {
		await screen.prepare(page);
	}
	await page.waitForTimeout(SETTLE_MS);
	await page.screenshot({ path: `${OUTPUT_DIR}/${screen.name}-${theme}-${widthName}.png`, fullPage: !screen.viewportOnly });
}

async function captureAll(page, screens) {

	for (const screen of screens) {
		for (const theme of THEMES) {
			for (const widthName of Object.keys(WIDTHS)) {
				await captureScreen(page, screen, theme, widthName);
			}
		}
	}
}

async function createEventForScreens(page, { name, code }) {

	await page.goto("/dashboard");
	await page.getByRole("button", { name: "New event" }).first().click();
	await page.getByLabel("Event name").fill(name);
	await page.getByLabel("Short link").fill(code);
	await page.getByText("Available").waitFor();
	await page.getByRole("button", { name: "Create event" }).click();
	await page.waitForURL(/\/events\/\d+\/program/);
	return Number(/\/events\/(\d+)\//.exec(page.url())[1]);
}


test("public screens", async ({ page }) => {
	await captureAll(page, [
		{ name: "landing", path: "/" },
		{ name: "login", path: "/login" },
		{ name: "signup", path: "/signup" },
		{ name: "not-found", path: "/this-code-does-not-exist/nope" }
	]);
});

test("organizer screens", async ({ page }) => {
	await signUpThroughUi(page, { displayName: "Kevin Holt" });
	await captureAll(page, [{ name: "dashboard-empty", path: "/dashboard" }]);

	const stamp = Date.now() % 100000;
	const eventId = await createEventForScreens(page, { name: "Ward Missionary Meals", code: `elm-ward-meals-${stamp}` });
	await createEventForScreens(page, { name: "Elm Ward Sacrament Meeting", code: `elm-ward-${stamp}` });

	await captureAll(page, [
		{ name: "dashboard", path: "/dashboard" },
		{
			name: "new-event-dialog",
			path: "/dashboard",
			viewportOnly: true,
			prepare: async (screenPage) => {
				await screenPage.getByRole("button", { name: "New event" }).click();
				await screenPage.getByLabel("Event name").fill("Youth Conference 2027");
				await screenPage.getByText("Available").waitFor();
			}
		},
		{ name: "event-settings", path: `/events/${eventId}/settings` },
		{ name: "account", path: "/account" },
		{ name: "program-editor-empty", path: `/events/${eventId}/program` }
	]);
});

test("calendar organizer screens", async ({ page }) => {
	await signUpThroughUi(page, { displayName: "Kevin Holt" });
	const eventId = await createEventForScreens(page, { name: "Ward Missionary Meals", code: `meals-${Date.now() % 100000}` });
	await seedCalendar(page, eventId, {
		config: { title: "Missionary meals" },
		items: [
			{ name: "Elders Ramos & Chen", color: "blue", shape: "circle" },
			{ name: "Elders Tuilagi & Brooks", color: "amber", shape: "triangle" },
			{ name: "Sisters Okafor & Lind", color: "green", shape: "square" },
			{ name: "Sisters Park & Moreau", color: "pink", shape: "diamond" }
		],
		rules: [
			{ effect: "block", kind: "recurring", frequency: "weekly", weekdays: [1], label: "P-day" },
			{ effect: "allow", kind: "recurring", frequency: "weekly", weekdays: [2, 4, 6], appliesTo: "selected", itemNames: ["Sisters Park & Moreau"] },
			{ effect: "block", kind: "recurring", frequency: "monthly_weekday", monthWeek: 1, monthWeekday: 0, label: "Fast Sunday" },
			{ effect: "block", kind: "recurring", frequency: "biweekly", weekdays: [3], startsOn: "2026-09-30", appliesTo: "selected", itemNames: ["Elders Tuilagi & Brooks"], label: "District council", active: false }
		]
	});
	const base = `/events/${eventId}/calendar`;
	await captureAll(page, [
		{ name: "calendar-overview", path: base },
		{ name: "calendar-setup", path: `${base}/setup` },
		{ name: "calendar-items", path: `${base}/items` },
		{
			name: "calendar-item-drawer",
			path: `${base}/items`,
			viewportOnly: true,
			prepare: async (screenPage) => {
				await screenPage.getByRole("button", { name: "Elders Ramos & Chen", exact: true }).click();
				await screenPage.getByRole("dialog").waitFor();
			}
		},
		{ name: "calendar-availability", path: `${base}/availability` },
		{
			name: "calendar-rule-drawer",
			path: `${base}/availability`,
			viewportOnly: true,
			prepare: async (screenPage) => {
				await screenPage.getByRole("button", { name: "Add rule" }).click();
				await screenPage.getByRole("dialog").waitFor();
			}
		}
	]);
});

test("program screens", async ({ page }) => {
	await signUpThroughUi(page, { displayName: "Kevin Holt" });
	const code = `elm-ward-${Date.now() % 100000}`;
	const eventId = await createEventForScreens(page, { name: "Elm Ward Sacrament Meeting", code });

	await page.getByLabel("Eyebrow").fill("Sacrament Meeting");
	await page.getByLabel("Title").fill("Elm Ward");
	await page.getByLabel("Date").fill("Sunday, October 4, 2026");
	await page.getByLabel("Time").fill("10:00 am");
	await page.getByLabel("Place").fill("Elm Chapel");
	await page.getByRole("button", { name: "Label / value" }).click();
	const rows = [["Presiding", "Bishop Daniel Arroyo"], ["Conducting", "Brother Marcus Lee"], ["Organist", "Sister Ana Kealoha"], ["Opening Hymn", "#2 The Spirit of God"]];
	for (const [index, [label, value]] of rows.entries()) {
		await page.getByLabel(`Label ${index + 1}`).fill(label);
		await page.getByLabel(`Value ${index + 1}`).fill(value);
		if (index < rows.length - 1) {
			await page.getByLabel(`Value ${index + 1}`).press("Enter");
		}
	}
	await page.getByRole("button", { name: "Add block" }).click();
	await page.getByRole("menuitem", { name: /^Separator/ }).click();
	await page.getByRole("button", { name: "Add block" }).click();
	await page.getByRole("menuitem", { name: /^Text/ }).click();
	const text = page.getByRole("textbox", { name: /Text block/ });
	await text.click();
	await page.keyboard.press("Control+b");
	await text.pressSequentially("Speakers");
	await page.keyboard.press("Control+b");
	await page.keyboard.press("Enter");
	await text.pressSequentially("This week our youth speakers share what they learned at youth conference.");
	await page.locator(".topbar .save-state").getByText("Saved").waitFor();
	await page.getByRole("button", { name: "Publish", exact: true }).click();
	await page.getByRole("status").getByText("Published").waitFor();

	await captureAll(page, [
		{ name: "program-editor", path: `/events/${eventId}/program`, viewportOnly: true },
		{ name: "program-public", path: `/${code}` }
	]);
});
