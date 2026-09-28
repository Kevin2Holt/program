import { fail, redirect } from "@sveltejs/kit";
import { logInUser } from "$server/services/authService.js";
import { signInWithCookies } from "$server/http/authCookies.js";
import { limitFormAction } from "$server/http/guards.js";
import { RATE_LIMITS } from "$server/http/rateLimit.js";
import { pickSafeReturnPath } from "$server/http/redirects.js";
import { HTTP } from "$server/http/status.js";


export function load({ locals, url }) {

	if (locals.user) {
		redirect(HTTP.seeOther, pickSafeReturnPath(url.searchParams.get("returnTo")));
	}
	return { returnTo: pickSafeReturnPath(url.searchParams.get("returnTo")) };
}

export const actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const email = String(form.get("email") || "");
		const limited = await limitFormAction(event, "login", RATE_LIMITS.login, email.toLowerCase());
		if (limited) {
			return limited;
		}

		const result = await logInUser({ email, password: form.get("password") });
		if (!result.ok) {
			return fail(HTTP.badRequest, { message: result.message, errors: result.errors, values: { email } });
		}
		await signInWithCookies(event.cookies, result.value.id);
		redirect(HTTP.seeOther, pickSafeReturnPath(String(form.get("returnTo") || "")));
	}
};
