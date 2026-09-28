/*
	Cookie changes around login and logout. A new CSRF token is issued at each
	boundary so a token seen before login can't be reused after it.
*/
import { config } from "../config.js";
import { buildSessionCookieOptions, SESSION_COOKIE, startSession } from "../auth/sessions.js";
import { buildCsrfCookieOptions, createCsrfToken, CSRF_COOKIE } from "./csrf.js";


function rotateCsrfCookie(cookies) {

	cookies.set(CSRF_COOKIE, createCsrfToken(), buildCsrfCookieOptions(config.isProduction));
}

export async function signInWithCookies(cookies, userId) {

	const { token, expiresAt } = await startSession(userId);
	cookies.set(SESSION_COOKIE, token, buildSessionCookieOptions(expiresAt, config.isProduction));
	rotateCsrfCookie(cookies);
}

export function clearSignInCookies(cookies) {

	cookies.delete(SESSION_COOKIE, { path: "/" });
	rotateCsrfCookie(cookies);
}
