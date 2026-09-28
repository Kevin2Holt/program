/*
	Screenshot pass for visual review: every screen, both themes, phone and
	desktop widths. Output: test-results/screens/<screen>-<theme>-<width>.png
	Screens needing data are added as milestones land.
*/
import { test } from "@playwright/test";
import { signUpThroughUi } from "../e2e/helpers.js";


const WIDTHS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 820 } };
const THEMES = ["dark", "light"];
const OUTPUT_DIR = "test-results/screens";
const SETTLE_MS = 350;

const PUBLIC_SCREENS = [
	{ name: "landing", path: "/" },
	{ name: "login", path: "/login" },
	{ name: "signup", path: "/signup" },
	{ name: "not-found", path: "/this-code-does-not-exist/nope" }
];

const ORGANIZER_SCREENS = [
	{ name: "dashboard", path: "/dashboard" },
	{ name: "account", path: "/account" }
];


async function captureScreen(page, screen, theme, widthName) {

	await page.setViewportSize(WIDTHS[widthName]);
	await page.context().addCookies([{ name: "progr_theme", value: theme, url: "http://localhost:4173" }]);
	await page.goto(screen.path);
	await page.waitForTimeout(SETTLE_MS);
	await page.screenshot({ path: `${OUTPUT_DIR}/${screen.name}-${theme}-${widthName}.png`, fullPage: true });
}


test("public screens", async ({ page }) => {
	for (const screen of PUBLIC_SCREENS) {
		for (const theme of THEMES) {
			for (const widthName of Object.keys(WIDTHS)) {
				await captureScreen(page, screen, theme, widthName);
			}
		}
	}
});

test("organizer screens", async ({ page }) => {
	await signUpThroughUi(page, { displayName: "Kevin Holt" });
	for (const screen of ORGANIZER_SCREENS) {
		for (const theme of THEMES) {
			for (const widthName of Object.keys(WIDTHS)) {
				await captureScreen(page, screen, theme, widthName);
			}
		}
	}
});
