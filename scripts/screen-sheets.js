/*
	Combines each screen's four screenshots (dark/light × phone/desktop) from
	test-results/screens into one review sheet: test-results/screens/sheets/<screen>.png
	Run after npm run test:screens.
*/
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";


const SCREENS_DIR = path.resolve("test-results/screens");
const SHEETS_DIR = path.join(SCREENS_DIR, "sheets");
const ORDER = ["dark-phone", "dark-desktop", "light-phone", "light-desktop"];
const SHEET_WIDTH_PX = 2100;
const SHEET_HEIGHT_PX = 900;
const PHONE_SHOT_HEIGHT_PX = 760;
const DESKTOP_SHOT_WIDTH_PX = 680;


function groupScreenshotsByScreen() {

	const groups = new Map();
	for (const file of fs.readdirSync(SCREENS_DIR).filter((name) => name.endsWith(".png"))) {
		const match = /^(.*)-(dark|light)-(phone|desktop)\.png$/.exec(file);
		if (match) {
			const [, screen, theme, width] = match;
			if (!groups.has(screen)) {
				groups.set(screen, {});
			}
			groups.get(screen)[`${theme}-${width}`] = path.join(SCREENS_DIR, file);
		}
	}
	return groups;
}

function buildSheetHtml(shots) {

	const images = ORDER.filter((key) => shots[key]).map((key) => {
		const data = fs.readFileSync(shots[key]).toString("base64");
		const style = key.endsWith("phone")
			? `height:${PHONE_SHOT_HEIGHT_PX}px;object-fit:cover;object-position:top`
			: `width:${DESKTOP_SHOT_WIDTH_PX}px`;
		return `<img src="data:image/png;base64,${data}" style="${style};align-self:flex-start">`;
	});
	return `<body style="margin:0;background:#777;display:flex;gap:8px;padding:8px;overflow:hidden">${images.join("")}</body>`;
}


fs.mkdirSync(SHEETS_DIR, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: SHEET_WIDTH_PX, height: SHEET_HEIGHT_PX } });
for (const [screen, shots] of groupScreenshotsByScreen()) {
	await page.setContent(buildSheetHtml(shots));
	await page.screenshot({ path: path.join(SHEETS_DIR, `${screen}.png`) });
}
await browser.close();
console.log(`sheets written to ${SHEETS_DIR}`);
