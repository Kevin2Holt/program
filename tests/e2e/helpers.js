/* Shared steps for browser tests. */
import { expect } from "@playwright/test";


export const TEST_PASSWORD = "correct horse battery";
let accountCounter = 0;


export function buildUniqueEmail(prefix = "organizer") {

	accountCounter += 1;
	return `${prefix}.${Date.now()}.${accountCounter}@example.test`;
}

export function buildUniqueCode(prefix) {

	accountCounter += 1;
	return `${prefix}-${Date.now() % 1000000}${accountCounter}`;
}

export async function signUpThroughUi(page, { displayName = "Test Organizer", email = buildUniqueEmail() } = {}) {

	await page.goto("/signup");
	await page.getByLabel("Your name").fill(displayName);
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(TEST_PASSWORD);
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	return { displayName, email };
}

export async function logInThroughUi(page, email, password = TEST_PASSWORD, { navigate = true } = {}) {

	if (navigate) {
		await page.goto("/login");
	}
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(password);
	await page.getByRole("button", { name: "Log in" }).click();
}

export async function createEventThroughUi(page, { name, code }) {

	await page.goto("/dashboard");
	await page.getByRole("button", { name: "New event" }).first().click();
	await page.getByLabel("Event name").fill(name);
	await page.getByLabel("Short link").fill(code);
	await expect(page.getByText("Available")).toBeVisible();
	await page.getByRole("button", { name: "Create event" }).click();
	await expect(page).toHaveURL(/\/events\/\d+\/program/);
	return Number(/\/events\/(\d+)\//.exec(page.url())[1]);
}

// Calls the JSON API from inside the page (same origin, with the page's CSRF token).
export async function callApi(page, method, path, body = undefined) {

	return page.evaluate(async ({ method: requestMethod, path: requestPath, body: requestBody }) => {
		const token = document.querySelector("meta[name=csrf-token]").getAttribute("content");
		const response = await fetch(requestPath, {
			method: requestMethod,
			headers: { "content-type": "application/json", accept: "application/json", "x-csrf-token": token },
			body: requestBody === undefined ? undefined : JSON.stringify(requestBody)
		});
		return { status: response.status, data: await response.json().catch(() => ({})) };
	}, { method, path, body });
}

// A calendar with Items and rules, created through the real API.
export async function seedCalendar(page, eventId, { config = {}, items = [], rules = [] } = {}) {

	await page.goto(`/events/${eventId}/calendar`);
	await page.getByRole("button", { name: "Create calendar" }).click();
	await expect(page).toHaveURL(/\/calendar\/setup/);
	const configResult = await callApi(page, "PATCH", `/api/events/${eventId}/calendar/config`, { changes: { status: "open", timeZone: "America/Denver", ...config } });
	expect(configResult.status).toBe(200);
	const created = [];
	for (const item of items) {
		const result = await callApi(page, "POST", `/api/events/${eventId}/calendar/items`, { item: { capacity: 1, times: [], ...item } });
		expect(result.status).toBe(201);
		created.push(result.data.item);
	}
	for (const rule of rules) {
		const resolved = { ...rule, itemIds: (rule.itemNames || []).map((name) => created.find((item) => item.name === name).id) };
		const result = await callApi(page, "POST", `/api/events/${eventId}/calendar/rules`, { rule: resolved });
		expect(result.status).toBe(201);
	}
	return created;
}
