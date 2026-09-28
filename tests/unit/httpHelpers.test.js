import { describe, expect, it } from "vitest";
import { checkCsrf, checkSameOrigin } from "../../src/lib/server/http/csrf.js";
import { pickSafeReturnPath } from "../../src/lib/server/http/redirects.js";


const ORIGIN = "http://localhost:5173";
const TOKEN = "a".repeat(43);


function buildRequest({ origin = ORIGIN, headers = {}, body = undefined, contentType = "application/json" } = {}) {

	return new Request(`${ORIGIN}/api/thing`, {
		method: "POST",
		headers: { ...(origin ? { origin } : {}), "content-type": contentType, ...headers },
		body
	});
}


describe("CSRF checks", () => {
	it("requires the same origin", () => {
		expect(checkSameOrigin(buildRequest(), ORIGIN)).toBe(true);
		expect(checkSameOrigin(buildRequest({ origin: "https://evil.example" }), ORIGIN)).toBe(false);
		expect(checkSameOrigin(buildRequest({ origin: null, headers: { "sec-fetch-site": "same-origin" } }), ORIGIN)).toBe(true);
		expect(checkSameOrigin(buildRequest({ origin: null }), ORIGIN)).toBe(false);
	});

	it("requires the token in a header or form field", async () => {
		expect(await checkCsrf(buildRequest({ headers: { "x-csrf-token": TOKEN } }), ORIGIN, TOKEN)).toBe(true);
		expect(await checkCsrf(buildRequest({ headers: { "x-csrf-token": "b".repeat(43) } }), ORIGIN, TOKEN)).toBe(false);
		expect(await checkCsrf(buildRequest(), ORIGIN, TOKEN)).toBe(false);
		const form = new URLSearchParams({ csrf: TOKEN, name: "x" }).toString();
		expect(await checkCsrf(buildRequest({ body: form, contentType: "application/x-www-form-urlencoded" }), ORIGIN, TOKEN)).toBe(true);
	});

	it("rejects a correct token from another origin", async () => {
		expect(await checkCsrf(buildRequest({ origin: "https://evil.example", headers: { "x-csrf-token": TOKEN } }), ORIGIN, TOKEN)).toBe(false);
	});
});

describe("return paths after login", () => {
	it("allows same-site paths only", () => {
		expect(pickSafeReturnPath("/events/4/program")).toBe("/events/4/program");
		expect(pickSafeReturnPath("//evil.example")).toBe("/dashboard");
		expect(pickSafeReturnPath("/\\evil.example")).toBe("/dashboard");
		expect(pickSafeReturnPath("https://evil.example")).toBe("/dashboard");
		expect(pickSafeReturnPath(null)).toBe("/dashboard");
	});
});
