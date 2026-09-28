import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { listReservedWords } from "../../src/lib/server/data/events.js";
import { checkCodeAvailability, createEvent, loadMembership, resolvePublicEvent, setEventAccent, updateEventSettings, archiveEvent } from "../../src/lib/server/services/eventService.js";
import { checkRoleHasPermission, listPermissionsForRole, PERMISSION } from "../../src/lib/server/services/permissionService.js";
import { clearAllTables, sql } from "../helpers/database.js";
import { createTestEvent, createTestUser } from "../helpers/factories.js";


const ROUTES_DIR = path.resolve("src/routes");

let owner;

beforeEach(async () => {
	await clearAllTables();
	await sql`insert into reserved_words (word, reason) values ('login', 'system'), ('dashboard', 'system'), ('events', 'system'), ('calendar', 'system'), ('c', 'prefix') on conflict do nothing`;
	owner = await createTestUser();
});


function listTopLevelRouteNames() {

	const names = new Set();
	for (const entry of fs.readdirSync(ROUTES_DIR, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name.startsWith("[")) {
			continue;
		}
		if (entry.name.startsWith("(")) {
			// Route groups don't appear in URLs; their children are top-level paths.
			for (const child of fs.readdirSync(path.join(ROUTES_DIR, entry.name), { withFileTypes: true })) {
				if (child.isDirectory() && !child.name.startsWith("[")) {
					names.add(child.name);
				}
			}
		}
		else {
			names.add(entry.name);
		}
	}
	return [...names];
}


describe("creating events", () => {
	it("creates the event with the creator as owner and a normalized code", async () => {
		const result = await createEvent(owner.id, { name: "  Elm Ward  ", code: "Elm-Ward" });
		expect(result.ok).toBe(true);
		expect(result.value).toMatchObject({ name: "Elm Ward", code: "elm-ward" });
		const membership = await loadMembership(result.value.id, owner.id);
		expect(membership.role).toBe("owner");
	});

	it("rejects bad shapes, reserved words, and taken codes", async () => {
		await createTestEvent(owner.id, { code: "taken-code" });
		expect((await createEvent(owner.id, { name: "A", code: "-bad" })).errors.code).toBeTruthy();
		expect((await createEvent(owner.id, { name: "A", code: "login" })).errors.code).toMatch(/reserved/);
		expect((await createEvent(owner.id, { name: "A", code: "c" })).errors.code).toBeTruthy();
		expect((await createEvent(owner.id, { name: "A", code: "taken-code" })).errors.code).toMatch(/taken/);
		expect((await createEvent(owner.id, { name: "", code: "fine-code" })).errors.name).toBeTruthy();
	});
});

describe("changing codes", () => {
	it("keeps the old code redirecting to the current one, through several changes", async () => {
		const event = await createTestEvent(owner.id, { code: "first-code" });
		expect((await updateEventSettings(event.id, { name: event.name, code: "second-code" })).ok).toBe(true);
		expect((await updateEventSettings(event.id, { name: event.name, code: "third-code" })).ok).toBe(true);

		expect(await resolvePublicEvent("first-code")).toEqual({ redirectCode: "third-code" });
		expect(await resolvePublicEvent("second-code")).toEqual({ redirectCode: "third-code" });
		expect((await resolvePublicEvent("third-code")).event.id).toBe(event.id);
		expect(await resolvePublicEvent("never-used")).toBeNull();
	});

	it("never lets another event take an old code", async () => {
		const event = await createTestEvent(owner.id, { code: "original" });
		await updateEventSettings(event.id, { name: event.name, code: "renamed" });
		expect((await checkCodeAvailability("original")).available).toBe(false);
		expect((await createEvent(owner.id, { name: "Other", code: "original" })).ok).toBe(false);
	});

	it("lets an event reclaim its own old code", async () => {
		const event = await createTestEvent(owner.id, { code: "home-base" });
		await updateEventSettings(event.id, { name: event.name, code: "away" });
		expect((await checkCodeAvailability("home-base", event.id)).available).toBe(true);
		expect((await updateEventSettings(event.id, { name: event.name, code: "home-base" })).ok).toBe(true);
		expect((await resolvePublicEvent("home-base")).event.id).toBe(event.id);
		expect(await resolvePublicEvent("away")).toEqual({ redirectCode: "home-base" });
	});

	it("the database refuses a current/old code collision even if the service is bypassed", async () => {
		const event = await createTestEvent(owner.id, { code: "live-one" });
		await expect(sql`insert into event_old_codes (code, event_id) values ('live-one', ${event.id})`).rejects.toThrow();
	});

	it("archived events are not public, and neither are their old codes", async () => {
		const event = await createTestEvent(owner.id, { code: "to-archive" });
		await updateEventSettings(event.id, { name: event.name, code: "archived-now" });
		await archiveEvent(event.id, true);
		expect(await resolvePublicEvent("archived-now")).toBeNull();
		expect(await resolvePublicEvent("to-archive")).toBeNull();
	});
});

describe("permissions", () => {
	it("owners hold every permission; other roles are narrower", () => {
		expect(listPermissionsForRole("owner")).toEqual(Object.values(PERMISSION));
		expect(checkRoleHasPermission("editor", PERMISSION.eventManage)).toBe(false);
		expect(checkRoleHasPermission("viewer", PERMISSION.calendarViewDetails)).toBe(false);
		expect(checkRoleHasPermission("stranger", PERMISSION.programView)).toBe(false);
	});

	it("non-members have no membership", async () => {
		const event = await createTestEvent(owner.id);
		const outsider = await createTestUser();
		expect(await loadMembership(event.id, outsider.id)).toBeNull();
	});
});

describe("route collisions", () => {
	it("every top-level route is a reserved word, so no event code can shadow it", async () => {
		await clearAllTables();
		const migration = fs.readFileSync("db/migrations/002_events.up.sql", "utf8");
		const seeded = [...migration.matchAll(/\('([a-z0-9-]+)', '[^']+'\)/g)].map((match) => match[1]);
		const missing = listTopLevelRouteNames().filter((name) => !seeded.includes(name));
		expect(missing).toEqual([]);
		expect(seeded).toContain("c");
	});

	it("reserved words load from the database", async () => {
		expect(await listReservedWords()).toContain("login");
	});
});

describe("accent color", () => {
	it("new events use indigo; a listed color is saved and reaches the public event", async () => {
		const owner = await createTestUser();
		const event = await createTestEvent(owner.id);
		expect((await resolvePublicEvent(event.code)).event.accent_color).toBe("indigo");

		const result = await setEventAccent(event.id, "teal");
		expect(result.ok).toBe(true);
		expect((await resolvePublicEvent(event.code)).event.accent_color).toBe("teal");
	});

	it("refuses colors outside the curated list", async () => {
		const owner = await createTestUser();
		const event = await createTestEvent(owner.id);
		const result = await setEventAccent(event.id, "#ff00ff");
		expect(result.ok).toBe(false);
		expect(result.errors.accentColor).toBeTruthy();
		expect((await resolvePublicEvent(event.code)).event.accent_color).toBe("indigo");
	});
});
