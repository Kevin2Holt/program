import { expect, test } from "@playwright/test";
import { buildUniqueCode, callApi, createEventThroughUi, seedCalendar, signUpThroughUi } from "./helpers.js";


test.describe("calendar setup", () => {
	test("create a calendar; setup shows only the fields for each choice and autosaves", async ({ page }) => {
		await signUpThroughUi(page);
		const eventId = await createEventThroughUi(page, { name: "Meals", code: buildUniqueCode("meals") });
		await page.getByRole("link", { name: "Add a calendar" }).click();
		await page.getByRole("button", { name: "Create calendar" }).click();
		await expect(page).toHaveURL(/\/calendar\/setup/);
		await expect(page.getByRole("status")).toContainText("Calendar created");

		await expect(page.getByRole("button", { name: "Decrease window size" })).toBeVisible();
		await expect(page.getByText("Start date")).toHaveCount(0);
		await page.getByRole("radio", { name: "Fixed dates" }).click();
		await expect(page.getByText("Start date")).toBeVisible();
		await expect(page.getByRole("button", { name: "Decrease window size" })).toHaveCount(0);
		await expect(page.getByText("Choose a start date.")).toBeVisible();
		await page.getByRole("radio", { name: "Rolling window" }).click();
		await expect(page.locator(".topbar .save-state")).toContainText("Saved");

		await expect(page.getByText("Stop people picking overlapping times")).toHaveCount(0);
		await page.getByRole("switch", { name: "Use times" }).click();
		await expect(page.getByText("Stop people picking overlapping times")).toBeVisible();

		await expect(page.getByRole("switch", { name: "Send a confirmation email" })).toBeDisabled();
		await page.getByRole("switch", { name: "Ask for email" }).click();
		await expect(page.getByRole("switch", { name: "Send a confirmation email" })).toBeEnabled();

		await page.getByRole("switch", { name: "Ask for phone" }).click();
		await expect(page.getByRole("switch", { name: "Ask for call or text" })).toHaveCount(0);
		await expect(page.locator(".topbar .save-state")).toContainText("Saved");

		await page.reload();
		await expect(page.getByRole("switch", { name: "Use times" })).toBeChecked();
		await expect(page.getByRole("switch", { name: "Ask for phone" })).not.toBeChecked();
		expect(eventId).toBeGreaterThan(0);
	});

	test("the event time zone is a searchable list", async ({ page }) => {
		await signUpThroughUi(page);
		const eventId = await createEventThroughUi(page, { name: "Zones", code: buildUniqueCode("zones") });
		await seedCalendar(page, eventId);
		await page.goto(`/events/${eventId}/calendar/setup`);
		await page.getByRole("button", { name: /Event Time Zone/ }).click();
		await page.getByRole("combobox", { name: "Search time zones" }).fill("manila");
		await page.getByRole("option", { name: /Asia\/Manila/ }).click();
		await expect(page.locator(".topbar .save-state")).toContainText("Saved");
		await page.reload();
		await expect(page.getByRole("button", { name: /Event Time Zone/ })).toContainText("Asia/Manila");
	});
});

test.describe("items", () => {
	test("add, edit, archive, and restore Items", async ({ page }) => {
		await signUpThroughUi(page);
		const eventId = await createEventThroughUi(page, { name: "Meals", code: buildUniqueCode("items") });
		await seedCalendar(page, eventId);
		await page.goto(`/events/${eventId}/calendar/items`);

		await page.getByRole("button", { name: "Add item" }).click();
		await page.getByLabel("Name").fill("Elders Ramos & Chen");
		await page.getByRole("radio", { name: "Violet" }).click();
		await page.getByRole("radio", { name: "Letter or number" }).click();
		await page.getByRole("button", { name: "Add item" }).last().click();
		await expect(page.getByRole("status")).toContainText("Item added");
		await expect(page.getByRole("button", { name: "Elders Ramos & Chen", exact: true })).toBeVisible();

		await page.getByRole("button", { name: "Actions for Elders Ramos & Chen" }).click();
		await page.getByRole("menuitem", { name: "Archive" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
		await expect(page.getByRole("status")).toContainText("Item archived");
		await expect(page.getByText("Add the first Item")).toBeVisible();

		await page.getByRole("button", { name: /Archived \(1\)/ }).click();
		await page.getByRole("button", { name: "Restore" }).click();
		await expect(page.getByRole("button", { name: "Elders Ramos & Chen", exact: true })).toBeVisible();
	});

	test("timed calendars give Items times, validated on save", async ({ page }) => {
		await signUpThroughUi(page);
		const eventId = await createEventThroughUi(page, { name: "Summit", code: buildUniqueCode("summit") });
		await seedCalendar(page, eventId, { config: { timed: true } });
		await page.goto(`/events/${eventId}/calendar/items`);
		await page.getByRole("button", { name: "Add item" }).click();
		await page.getByLabel("Name").fill("Budget Basics");
		await page.getByRole("button", { name: "Add time" }).click();
		await page.getByLabel("Minutes").fill("2");
		await page.getByRole("button", { name: "Add item" }).last().click();
		await expect(page.getByText("Use at least 5 minutes.")).toBeVisible();
		await page.getByLabel("Minutes").fill("60");
		await page.getByRole("button", { name: "Add item" }).last().click();
		await expect(page.getByText("9:00 am")).toBeVisible();
	});
});

test.describe("availability rules", () => {
	test("Applies to follows the checkboxes; rules toggle and delete", async ({ page }) => {
		await signUpThroughUi(page);
		const eventId = await createEventThroughUi(page, { name: "Meals", code: buildUniqueCode("rules") });
		await seedCalendar(page, eventId, { items: [{ name: "Ramos", color: "blue", shape: "circle" }, { name: "Tuilagi", color: "amber", shape: "triangle" }] });
		await page.goto(`/events/${eventId}/calendar/availability`);

		await page.getByRole("button", { name: "Add rule" }).click();
		const drawer = page.getByRole("dialog", { name: "New rule" });
		await expect(drawer.getByRole("radio", { name: "All Items" })).toHaveAttribute("aria-checked", "true");
		await drawer.getByRole("checkbox", { name: "Tuilagi" }).uncheck();
		await expect(drawer.getByRole("radio", { name: "Selected Items" })).toHaveAttribute("aria-checked", "true");
		await drawer.getByRole("checkbox", { name: "Tuilagi" }).check();
		await expect(drawer.getByRole("radio", { name: "All Items" })).toHaveAttribute("aria-checked", "true");
		await drawer.getByRole("radio", { name: "Selected Items" }).click();
		await drawer.getByRole("checkbox", { name: "Ramos" }).check();
		await expect(drawer.getByRole("radio", { name: "Selected Items" })).toHaveAttribute("aria-checked", "true");
		await drawer.getByRole("checkbox", { name: "Ramos" }).uncheck();
		await expect(drawer.getByRole("radio", { name: "All Items" })).toHaveAttribute("aria-checked", "true");

		const tuesday = drawer.getByRole("button", { name: "Tuesday" });
		if (await tuesday.getAttribute("aria-pressed") !== "true") {
			await tuesday.click();
		}
		await drawer.getByRole("button", { name: "Add rule" }).click();
		await expect(page.getByRole("status")).toContainText("Rule added");

		const toggle = page.getByRole("switch", { name: /Deactivate/ }).first();
		await toggle.click();
		await expect(page.getByText("Inactive")).toBeVisible();
		await page.getByRole("button", { name: "Delete rule" }).first().click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete rule" }).click();
		await expect(page.getByRole("status")).toContainText("Rule deleted");
		await expect(page.getByText("Every day in the window is open")).toBeVisible();
	});

	test("the overview shows organizer statuses, with the blocking rule named", async ({ page }) => {
		await signUpThroughUi(page);
		const eventId = await createEventThroughUi(page, { name: "Meals", code: buildUniqueCode("ovw") });
		await seedCalendar(page, eventId, {
			config: { windowMode: "fixed", fixedStart: "2030-01-06", fixedEnd: "2030-01-12" },
			items: [{ name: "Ramos", color: "blue", shape: "circle" }],
			rules: [{ effect: "block", kind: "once", onceDate: "2030-01-08" }]
		});
		await page.goto(`/events/${eventId}/calendar?week=2030-01-06`);
		await expect(page.getByRole("cell", { name: /Tue, Jan 8: Blocked\. Blocked by: Block Tuesday, January 8/ })).toBeVisible();
		await expect(page.getByRole("cell", { name: /Wed, Jan 9: Open/ })).toBeVisible();
		const cross = await callApi(page, "PATCH", "/api/events/999999/calendar/config", { changes: {} });
		expect(cross.status).toBe(404);
	});
});
