/*
	Request guards used by routes: require a signed-in user, and apply a rate
	limit that turns into a friendly form error or a 429.
*/
import { error, fail as failAction, redirect } from "@sveltejs/kit";
import { buildLoginRedirectPath } from "./redirects.js";
import { buildRateLimitKey, recordRateLimitHit } from "./rateLimit.js";
import { HTTP } from "./status.js";


const SECONDS_PER_MINUTE = 60;


export function requireUser(event) {

	if (!event.locals.user) {
		redirect(HTTP.seeOther, buildLoginRedirectPath(event.url));
	}
	return event.locals.user;
}

export function describeRetryWait(retryAfterS) {

	const minutes = Math.ceil(retryAfterS / SECONDS_PER_MINUTE);
	return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}

// For form actions: returns a SvelteKit fail() to return, or null when allowed.
export async function limitFormAction(event, scope, limitRule, extraKey = "") {

	const key = buildRateLimitKey(scope, event.getClientAddress(), extraKey);
	const { allowed, retryAfterS } = await recordRateLimitHit(key, limitRule);
	if (allowed) {
		return null;
	}
	return failAction(HTTP.tooManyRequests, { message: `Too many attempts. Try again in ${describeRetryWait(retryAfterS)}.`, errors: {} });
}

// For endpoints: throws a 429 when over the limit.
export async function limitEndpoint(event, scope, limitRule, extraKey = "") {

	const key = buildRateLimitKey(scope, event.getClientAddress(), extraKey);
	const { allowed, retryAfterS } = await recordRateLimitHit(key, limitRule);
	if (!allowed) {
		error(HTTP.tooManyRequests, `Too many requests. Try again in ${describeRetryWait(retryAfterS)}.`);
	}
}
