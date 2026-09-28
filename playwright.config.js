/*
	Browser tests run against a production build on port 4173, using the test
	database (reset before the run). Projects:
	- e2e: route guards, CSRF, and key flows.
	- screens: screenshots of every screen in both themes at phone and desktop
	  widths, saved to test-results/screens for visual review.
*/
import dotenv from "dotenv";
import { defineConfig } from "@playwright/test";


dotenv.config({ quiet: true });

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;
const SERVER_START_TIMEOUT_MS = 180000;


export default defineConfig({
	globalSetup: "./tests/setup/playwrightGlobalSetup.js",
	fullyParallel: false,
	workers: 1,
	reporter: [["list"]],
	use: {
		baseURL: BASE_URL,
		trace: "retain-on-failure"
	},
	projects: [
		{ name: "e2e", testDir: "tests/e2e" },
		{ name: "screens", testDir: "tests/screens" }
	],
	webServer: {
		command: "npm run build && node build",
		url: `${BASE_URL}/login`,
		reuseExistingServer: false,
		timeout: SERVER_START_TIMEOUT_MS,
		env: {
			DATABASE_URL: process.env.TEST_DATABASE_URL,
			PORT: String(PORT),
			ORIGIN: BASE_URL,
			PUBLIC_BASE_URL: "https://progr.am",
			MAIL_TRANSPORT: "log",
			RATE_LIMIT_SCALE: "100"
		}
	}
});
