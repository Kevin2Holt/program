/* Shared steps for browser tests. */
import { expect } from "@playwright/test";


export const TEST_PASSWORD = "correct horse battery";
let accountCounter = 0;


export function buildUniqueEmail(prefix = "organizer") {

	accountCounter += 1;
	return `${prefix}.${Date.now()}.${accountCounter}@example.test`;
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
