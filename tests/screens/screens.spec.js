/*
	Screenshot pass for visual review: every screen, both themes, phone and
	desktop widths. Output: test-results/screens/<screen>-<theme>-<width>.png
	Then: node scripts/screen-sheets.js builds one review sheet per screen.
*/
import { test } from "@playwright/test";
import { signUpThroughUi } from "../e2e/helpers.js";


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
		{ name: "account", path: "/account" }
	]);
});
