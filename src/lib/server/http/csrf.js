/*
	CSRF protection for every change-making request (forms and JSON alike).
	Two independent checks must both pass:
	1. Same origin: the Origin header (or Sec-Fetch-Site) says the request came
	   from this site.
	2. Double-submit token: a random per-visitor token lives in an HttpOnly
	   cookie; pages receive it from the root layout and send it back in the
	   x-csrf-token header (fetch) or a "csrf" form field (forms).
*/
import crypto from "node:crypto";


export const CSRF_COOKIE = "progr_csrf";
export const CSRF_HEADER = "x-csrf-token";
export const CSRF_FORM_FIELD = "csrf";
const CSRF_TOKEN_BYTES = 32;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const FORM_CONTENT_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data"];


export function createCsrfToken() {

	return crypto.randomBytes(CSRF_TOKEN_BYTES).toString("base64url");
}

export function checkMethodChangesState(method) {

	return !SAFE_METHODS.has(method);
}

export function checkSameOrigin(request, appOrigin) {

	const origin = request.headers.get("origin");
	if (origin) {
		return origin === appOrigin;
	}
	// Browsers that omit Origin still send Sec-Fetch-Site on modern versions.
	return request.headers.get("sec-fetch-site") === "same-origin";
}

function compareTokens(expected, submitted) {

	if (!expected || !submitted || expected.length !== submitted.length) {
		return false;
	}
	return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(submitted));
}

async function readSubmittedToken(request) {

	const headerToken = request.headers.get(CSRF_HEADER);
	if (headerToken) {
		return headerToken;
	}
	const contentType = request.headers.get("content-type") || "";
	if (FORM_CONTENT_TYPES.some((type) => contentType.startsWith(type))) {
		const form = await request.clone().formData();
		const field = form.get(CSRF_FORM_FIELD);
		return typeof field === "string" ? field : "";
	}
	return "";
}

export async function checkCsrf(request, appOrigin, cookieToken) {

	if (!checkSameOrigin(request, appOrigin)) {
		return false;
	}
	return compareTokens(cookieToken, await readSubmittedToken(request));
}

export function buildCsrfCookieOptions(isProduction) {

	return { path: "/", httpOnly: true, sameSite: "lax", secure: isProduction };
}
