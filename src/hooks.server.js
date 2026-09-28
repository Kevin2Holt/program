/*
	Runs on every request, in order: theme, CSRF token, session, CSRF check,
	then security headers on the response. Errors get a short reference id
	that is logged with the details; the page shows only the id.
*/
import crypto from "node:crypto";
import { error, json } from "@sveltejs/kit";
import { config } from "$server/config.js";
import { resolveSession, SESSION_COOKIE } from "$server/auth/sessions.js";
import { buildCsrfCookieOptions, checkCsrf, checkMethodChangesState, createCsrfToken, CSRF_COOKIE } from "$server/http/csrf.js";
import { HTTP } from "$server/http/status.js";


const THEME_COOKIE = "progr_theme";
const THEMES = ["dark", "light"];
const DEFAULT_THEME = "dark";
const ERROR_REFERENCE_BYTES = 4;
const HTTP_SERVER_ERROR_MIN = 500;

const SECURITY_HEADERS = {
	"x-content-type-options": "nosniff",
	"referrer-policy": "strict-origin-when-cross-origin",
	"x-frame-options": "DENY",
	"permissions-policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()"
};


function readTheme(cookies) {

	const theme = cookies.get(THEME_COOKIE);
	return THEMES.includes(theme) ? theme : DEFAULT_THEME;
}

function ensureCsrfToken(cookies) {

	let token = cookies.get(CSRF_COOKIE);
	if (!token) {
		token = createCsrfToken();
		cookies.set(CSRF_COOKIE, token, buildCsrfCookieOptions(config.isProduction));
	}
	return token;
}

function checkWantsJson(request, url) {

	return url.pathname.startsWith("/api/") || (request.headers.get("accept") || "").includes("application/json");
}


export async function handle({ event, resolve }) {

	const { cookies, request, url, locals } = event;
	locals.theme = readTheme(cookies);
	locals.csrfToken = ensureCsrfToken(cookies);

	const sessionToken = cookies.get(SESSION_COOKIE) || null;
	const session = await resolveSession(sessionToken);
	locals.user = session ? session.user : null;
	locals.sessionToken = session ? sessionToken : null;
	if (sessionToken && !session) {
		cookies.delete(SESSION_COOKIE, { path: "/" });
	}

	if (checkMethodChangesState(request.method) && !await checkCsrf(request, url.origin, locals.csrfToken)) {
		const message = "This request couldn't be verified. Reload the page and try again.";
		if (checkWantsJson(request, url)) {
			return json({ ok: false, code: "csrf", message }, { status: HTTP.forbidden });
		}
		error(HTTP.forbidden, message);
	}

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace("%progr.theme%", locals.theme)
	});
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(name, value);
	}
	return response;
}

export function handleError({ error: err, status }) {

	const reference = crypto.randomBytes(ERROR_REFERENCE_BYTES).toString("hex");
	if (status >= HTTP_SERVER_ERROR_MIN) {
		console.error(`[error ${reference}]`, err);
	}
	return { message: "Something went wrong on our side.", reference };
}
