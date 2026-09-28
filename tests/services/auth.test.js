import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/lib/server/auth/passwords.js";
import { endSession, resolveSession, startSession } from "../../src/lib/server/auth/sessions.js";
import { changeAccountPassword, logInUser, signUpUser, updateAccountProfile } from "../../src/lib/server/services/authService.js";
import { recordRateLimitHit } from "../../src/lib/server/http/rateLimit.js";
import { clearAllTables, sql } from "../helpers/database.js";
import { createTestUser } from "../helpers/factories.js";


beforeEach(async () => {
	await clearAllTables();
});


describe("password hashing", () => {
	it("verifies the right password and rejects others", async () => {
		const stored = await hashPassword("s3cret password");
		expect(stored.startsWith("scrypt$")).toBe(true);
		expect(await verifyPassword("s3cret password", stored)).toBe(true);
		expect(await verifyPassword("wrong password", stored)).toBe(false);
		expect(await verifyPassword("anything", "garbage")).toBe(false);
	});
});

describe("sign up and log in", () => {
	it("creates an account and logs in case-insensitively by email", async () => {
		const signup = await signUpUser({ displayName: "Kevin", email: "Kevin@Example.com", password: "long enough" });
		expect(signup.ok).toBe(true);
		expect(signup.value.email).toBe("kevin@example.com");

		const login = await logInUser({ email: "KEVIN@example.com", password: "long enough" });
		expect(login.ok).toBe(true);
		expect(login.value.id).toBe(signup.value.id);
	});

	it("never stores the plain password", async () => {
		const user = await createTestUser();
		const [row] = await sql`select password_hash from users where id = ${user.id}`;
		expect(row.password_hash).not.toContain(user.password);
	});

	it("rejects duplicate emails regardless of case", async () => {
		await createTestUser({ email: "dup@example.com" });
		const result = await signUpUser({ displayName: "Two", email: "DUP@example.com", password: "long enough" });
		expect(result.ok).toBe(false);
		expect(result.errors.email).toMatch(/already exists/);
	});

	it("returns field errors for invalid input", async () => {
		const result = await signUpUser({ displayName: "", email: "nope", password: "short" });
		expect(result.ok).toBe(false);
		expect(Object.keys(result.errors).sort()).toEqual(["displayName", "email", "password"]);
	});

	it("gives the same message for unknown email and wrong password", async () => {
		await createTestUser({ email: "known@example.com" });
		const unknown = await logInUser({ email: "unknown@example.com", password: "whatever1" });
		const wrong = await logInUser({ email: "known@example.com", password: "whatever1" });
		expect(unknown.ok).toBe(false);
		expect(unknown.message).toBe(wrong.message);
	});
});

describe("account changes", () => {
	it("updates name and email, refusing an email in use", async () => {
		const user = await createTestUser();
		await createTestUser({ email: "taken@example.com" });
		const taken = await updateAccountProfile(user.id, { displayName: "New Name", email: "Taken@example.com" });
		expect(taken.ok).toBe(false);
		const updated = await updateAccountProfile(user.id, { displayName: "New Name", email: "new@example.com" });
		expect(updated.ok).toBe(true);
		expect(updated.value).toMatchObject({ displayName: "New Name", email: "new@example.com" });
	});

	it("changes the password only with the current one", async () => {
		const user = await createTestUser();
		const wrong = await changeAccountPassword(user.id, { currentPassword: "nope nope", newPassword: "brand new pass", confirmPassword: "brand new pass" });
		expect(wrong.errors.currentPassword).toBeTruthy();
		const mismatch = await changeAccountPassword(user.id, { currentPassword: user.password, newPassword: "brand new pass", confirmPassword: "different" });
		expect(mismatch.errors.confirmPassword).toBeTruthy();
		const ok = await changeAccountPassword(user.id, { currentPassword: user.password, newPassword: "brand new pass", confirmPassword: "brand new pass" });
		expect(ok.ok).toBe(true);
		expect((await logInUser({ email: user.email, password: "brand new pass" })).ok).toBe(true);
	});
});

describe("sessions", () => {
	it("resolves a live session and forgets it after logout", async () => {
		const user = await createTestUser();
		const { token } = await startSession(user.id);
		const session = await resolveSession(token);
		expect(session.user.id).toBe(user.id);

		const [row] = await sql`select count(*)::int as n from sessions where token_hash = ${Buffer.from(token)}`;
		expect(row.n).toBe(0);

		await endSession(token);
		expect(await resolveSession(token)).toBeNull();
	});

	it("ignores expired sessions", async () => {
		const user = await createTestUser();
		const { token } = await startSession(user.id);
		await sql`update sessions set expires_at = now() - interval '1 minute'`;
		expect(await resolveSession(token)).toBeNull();
	});
});

describe("rate limits", () => {
	it("allows up to the limit within a window, then refuses", async () => {
		const rule = { limit: 3, windowS: 60 };
		const results = [];
		for (let attempt = 0; attempt < 4; attempt += 1) {
			results.push((await recordRateLimitHit("test:1.2.3.4", rule)).allowed);
		}
		expect(results).toEqual([true, true, true, false]);
		expect((await recordRateLimitHit("test:5.6.7.8", rule)).allowed).toBe(true);
	});
});
