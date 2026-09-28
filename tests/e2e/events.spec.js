import { expect, test } from "@playwright/test";
import { createEventThroughUi, signUpThroughUi } from "./helpers.js";



test.describe("events", () => {
	test("create an event from the dashboard and see it listed", async ({ page }) => {
		await signUpThroughUi(page);
		await expect(page.getByText("Create your first event")).toBeVisible();
		const code = `ward-${Date.now() % 1000000}`;
		await createEventThroughUi(page, { name: "Elm Ward Meals", code });
		await expect(page.getByRole("status")).toContainText("Event created");

		await page.goto("/dashboard");
		await expect(page.getByRole("link", { name: /Elm Ward Meals/ })).toBeVisible();
	});

	test("the code field explains reserved and taken codes before saving", async ({ page }) => {
		await signUpThroughUi(page);
		await page.getByRole("button", { name: "New event" }).first().click();
		await page.getByLabel("Short link").fill("dashboard");
		await expect(page.getByText('"dashboard" is reserved. Try another link.')).toBeVisible();
		await page.getByLabel("Short link").fill("-nope");
		await expect(page.getByText(/single hyphens/)).toBeVisible();
	});

	test("changing the code keeps the old link working", async ({ page }) => {
		await signUpThroughUi(page);
		const stamp = Date.now() % 1000000;
		const eventId = await createEventThroughUi(page, { name: "Summit", code: `summit-${stamp}` });

		await page.goto(`/events/${eventId}/settings`);
		await page.getByLabel("Short link").fill(`summit-new-${stamp}`);
		await expect(page.getByText("Available")).toBeVisible();
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByRole("status")).toContainText("old link now redirects");

		const response = await page.request.get(`/summit-${stamp}`, { maxRedirects: 0 });
		expect(response.status()).toBe(308);
		expect(response.headers().location).toBe(`/summit-new-${stamp}`);
		await page.goto(`/summit-${stamp}`);
		await expect(page).toHaveURL(new RegExp(`/summit-new-${stamp}$`));
	});

	test("other organizers can't see an event (404), and visitors must log in", async ({ page, browser }) => {
		await signUpThroughUi(page);
		const eventId = await createEventThroughUi(page, { name: "Private", code: `private-${Date.now() % 1000000}` });

		const outsider = await browser.newPage();
		await signUpThroughUi(outsider);
		const response = await outsider.goto(`/events/${eventId}/settings`);
		expect(response.status()).toBe(404);
		await outsider.close();

		const anonymous = await browser.newPage();
		await anonymous.goto(`/events/${eventId}/program`);
		await expect(anonymous).toHaveURL(/\/login\?returnTo=/);
		await anonymous.close();
	});

	test("archiving hides the public page; restoring brings it back", async ({ page }) => {
		await signUpThroughUi(page);
		const code = `archive-me-${Date.now() % 1000000}`;
		const eventId = await createEventThroughUi(page, { name: "Archive Me", code });
		expect((await page.request.get(`/${code}`)).status()).toBe(200);

		await page.goto(`/events/${eventId}/settings`);
		await page.getByRole("button", { name: "Archive", exact: true }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
		await expect(page.getByRole("status")).toContainText("Event archived");
		expect((await page.request.get(`/${code}`)).status()).toBe(404);

		await page.getByRole("button", { name: "Restore" }).click();
		await expect(page.getByRole("status")).toContainText("Event restored");
		expect((await page.request.get(`/${code}`)).status()).toBe(200);
	});
});

test.describe("public routing", () => {
	test("unknown codes are a styled 404, and organizer paths never resolve as codes", async ({ page }) => {
		const response = await page.goto("/no-such-event-here");
		expect(response.status()).toBe(404);
		await expect(page.getByText("Page not found")).toBeVisible();

		await page.goto("/events");
		await expect(page).not.toHaveURL(/no-such/);
		expect((await page.request.get("/dashboard", { maxRedirects: 0 })).status()).toBe(303);
	});
});
