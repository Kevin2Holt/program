/* Safe post-login destinations: only same-site paths are allowed (no open redirects). */


export const DEFAULT_AFTER_LOGIN_PATH = "/dashboard";


export function pickSafeReturnPath(candidate, fallback = DEFAULT_AFTER_LOGIN_PATH) {

	if (typeof candidate !== "string" || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\")) {
		return fallback;
	}
	return candidate;
}

export function buildLoginRedirectPath(url) {

	return `/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`;
}
