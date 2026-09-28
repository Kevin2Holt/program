import { expect, test } from "@playwright/test";
import { buildUniqueEmail, logInThroughUi, signUpThroughUi, TEST_PASSWORD } from "./helpers.js";


test.describe("auth guards", () => {
	test("organizer pages send anonymous visitors to log in, then back", async ({ page }) => {
		await page.goto("/account");
		await expect(page).toHaveURL(/\/login\?returnTo=%2Faccount$/);

		const { email } = await signUpThroughUi(page);
		await page.getByRole("button", { name: "Account menu" }).click();
		await page.getByRole("menuitem", { name: "Log out" }).click();
		await expect(page).toHaveURL(/\/login$/);

		await page.goto("/account");
		await expect(page).toHaveURL(/returnTo=%2Faccount/);
		await logInThroughUi(page, email, undefined, { navigate: false });
		await expect(page).toHaveURL(/\/account$/);
	});

	test("a wrong password shows one clear message", async ({ page }) => {
		const { email } = await signUpThroughUi(page);
		await page.context().clearCookies();
		await logInThroughUi(page, email, "not the password");
		await expect(page.getByRole("alert")).toContainText("don't match an account");
		await expect(page).toHaveURL(/\/login/);
	});

	test("signup shows field errors inline and keeps typed values", async ({ page }) => {
		await page.goto("/signup");
		await page.getByLabel("Your name").fill("Pat");
		await page.getByLabel("Email").fill("not-an-email");
		await page.getByLabel("Password").fill("short");
		await page.getByRole("button", { name: "Create account" }).click();
		await expect(page.getByText("Enter an email like name@example.com.")).toBeVisible();
		await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
		await expect(page.getByLabel("Your name")).toHaveValue("Pat");
	});
});

test.describe("request protection", () => {
	test("change-making requests without a CSRF token are refused", async ({ request }) => {
		const response = await request.post("/logout", { headers: { origin: "http://localhost:4173" }, maxRedirects: 0 });
		expect(response.status()).toBe(403);
	});

	test("cross-site form posts are refused even with a token", async ({ page, request }) => {
		await page.goto("/login");
		const token = await page.locator("input[name=csrf]").first().inputValue();
		const response = await request.post("/login", {
			headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" },
			data: `csrf=${token}&email=a%40b.c&password=x`,
			maxRedirects: 0
		});
		expect(response.status()).toBe(403);
	});

	test("responses carry security headers", async ({ request }) => {
		const response = await request.get("/login");
		expect(response.headers()["x-content-type-options"]).toBe("nosniff");
		expect(response.headers()["x-frame-options"]).toBe("DENY");
	});

	test("the dev-only design system page is hidden in production", async ({ request }) => {
		expect((await request.get("/design-system")).status()).toBe(404);
	});
});

test.describe("account settings", () => {
	test("profile and password changes save without a page reload", async ({ page }) => {
		const email = buildUniqueEmail();
		await signUpThroughUi(page, { email });
		await page.goto("/account");

		await page.getByLabel("Name", { exact: true }).fill("Renamed Organizer");
		await page.getByRole("button", { name: "Save profile" }).click();
		await expect(page.getByRole("status")).toContainText("Profile saved");

		await page.getByLabel("Current password").fill(TEST_PASSWORD);
		await page.getByLabel("New password", { exact: true }).fill("a brand new password");
		await page.getByLabel("Confirm new password").fill("a brand new password");
		await page.getByRole("button", { name: "Change password" }).click();
		await expect(page.getByRole("status")).toContainText("Password changed");

		await page.reload();
		await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Renamed Organizer");
	});

	test("the theme choice is remembered across pages", async ({ page }) => {
		await signUpThroughUi(page);
		await page.goto("/account");
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		await page.getByRole("radio", { name: "Light" }).click();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
		await page.goto("/dashboard");
		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
	});
});
