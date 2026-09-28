/* Playwright global setup: same clean test database as the Vitest run. */
import prepareTestDatabase from "./prepareTestDatabase.js";


export default async function setUpBrowserTests() {

	await prepareTestDatabase();
}
