import { fail, redirect } from "@sveltejs/kit";
import { signUpUser } from "$server/services/authService.js";
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
		const limited = await limitFormAction(event, "signup", RATE_LIMITS.signup);
		if (limited) {
			return limited;
		}

		const form = await event.request.formData();
		const input = {
			displayName: String(form.get("displayName") || ""),
			email: String(form.get("email") || ""),
			password: String(form.get("password") || "")
		};
		const result = await signUpUser(input);
		if (!result.ok) {
			return fail(HTTP.badRequest, { message: result.message, errors: result.errors, values: { displayName: input.displayName, email: input.email } });
		}
		await signInWithCookies(event.cookies, result.value.id);
		redirect(HTTP.seeOther, pickSafeReturnPath(String(form.get("returnTo") || "")));
	}
};
