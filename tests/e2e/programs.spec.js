import { expect, test } from "@playwright/test";
import { signUpThroughUi } from "./helpers.js";


async function createEventAndOpenEditor(page) {

	await signUpThroughUi(page);
	const code = `prog-${Date.now() % 1000000}`;
	await page.goto("/dashboard");
	await page.getByRole("button", { name: "New event" }).first().click();
	await page.getByLabel("Event name").fill("Elm Ward");
	await page.getByLabel("Short link").fill(code);
	await expect(page.getByText("Available")).toBeVisible();
	await page.getByRole("button", { name: "Create event" }).click();
	await expect(page).toHaveURL(/\/program/);
	return code;
}

async function waitForSaved(page) {

	await expect(page.locator(".topbar .save-state")).toContainText("Saved");
}


test.describe("program editor", () => {
	test("build, publish, and read the program on the public page", async ({ page }) => {
		const code = await createEventAndOpenEditor(page);
		await expect(page.getByText("Start your program")).toBeVisible();

		await page.getByLabel("Title").fill("Elm Ward");
		await page.getByLabel("Eyebrow").fill("Sacrament Meeting");

		await page.getByRole("button", { name: "Label / value" }).click();
		await page.getByLabel("Label 1").fill("Presiding");
		await page.getByLabel("Value 1").fill("Bishop Arroyo");
		await page.getByLabel("Value 1").press("Enter");
		await page.getByLabel("Label 2").fill("Conducting");
		await page.getByLabel("Value 2").fill("Brother Lee");

		await page.getByRole("button", { name: "Add block" }).click();
		await page.getByRole("menuitem", { name: /^Text/ }).click();
		const text = page.getByRole("textbox", { name: /Text block/ });
		await text.click();
		await text.pressSequentially("Welcome, everyone.");
		await waitForSaved(page);

		const preview = page.getByRole("complementary", { name: "Live preview" });
		await expect(preview.getByText("Bishop Arroyo")).toBeVisible();
		await expect(preview.getByText("Welcome, everyone.")).toBeVisible();

		expect((await page.request.get(`/${code}`)).status()).toBe(200);
		await page.getByRole("button", { name: "Publish", exact: true }).click();
		await expect(page.getByRole("status")).toContainText("Published");

		const publicPage = await page.context().newPage();
		await publicPage.goto(`/${code}`);
		await expect(publicPage.getByRole("heading", { name: "Elm Ward" })).toBeVisible();
		await expect(publicPage.getByText("Presiding")).toBeVisible();
		await expect(publicPage.getByText("Welcome, everyone.")).toBeVisible();
		await publicPage.close();
	});

	test("draft edits stay private until published; roll back restores the old version", async ({ page }) => {
		const code = await createEventAndOpenEditor(page);
		await page.getByLabel("Title").fill("Version one");
		await waitForSaved(page);
		await page.getByRole("button", { name: "Publish", exact: true }).click();
		await expect(page.getByRole("status")).toContainText("Published");

		await page.getByLabel("Title").fill("Version two");
		await waitForSaved(page);
		await expect(page.getByText("Unpublished changes")).toBeVisible();
		await page.goto(`/${code}`);
		await expect(page.getByRole("heading", { name: "Version one" })).toBeVisible();

		await page.goBack();
		await page.getByRole("button", { name: "Publish", exact: true }).click();
		await expect(page.getByRole("status")).toContainText("Published");
		await page.getByRole("button", { name: "More publishing actions" }).click();
		await page.getByRole("menuitem", { name: "Roll back to previous version" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Roll back" }).click();
		await expect(page.getByRole("status")).toContainText("Rolled back");

		await page.goto(`/${code}`);
		await expect(page.getByRole("heading", { name: "Version one" })).toBeVisible();
	});

	test("deleting a block can be undone", async ({ page }) => {
		await createEventAndOpenEditor(page);
		await page.getByRole("button", { name: "Label / value" }).click();
		await page.getByLabel("Label 1").fill("Keep me");
		await waitForSaved(page);
		await page.getByRole("button", { name: "Delete block" }).click();
		await expect(page.getByLabel("Label 1")).toHaveCount(0);
		await page.getByRole("button", { name: "Undo" }).click();
		await expect(page.getByLabel("Label 1")).toHaveValue("Keep me");
		await page.reload();
		await expect(page.getByLabel("Label 1")).toHaveValue("Keep me");
	});

	test("blocks reorder with the keyboard and the order persists", async ({ page }) => {
		await createEventAndOpenEditor(page);
		await page.getByRole("button", { name: "Label / value" }).click();
		await page.getByLabel("Label 1").fill("First");
		await page.getByRole("button", { name: "Add block" }).click();
		await page.getByRole("menuitem", { name: /^Separator/ }).click();
		await waitForSaved(page);

		const separatorGrip = page.getByRole("button", { name: /Reorder Separator block 2 of 2/ });
		await separatorGrip.focus();
		await page.keyboard.press("Space");
		await page.keyboard.press("ArrowUp");
		await page.keyboard.press("Space");
		await waitForSaved(page);

		await page.reload();
		await expect(page.getByRole("button", { name: /Reorder Separator block 1 of 2/ })).toBeVisible();
	});
});
