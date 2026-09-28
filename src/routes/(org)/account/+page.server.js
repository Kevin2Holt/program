import { fail } from "@sveltejs/kit";
import { endOtherSessions } from "$server/auth/sessions.js";
import { changeAccountPassword, updateAccountProfile } from "$server/services/authService.js";
import { limitFormAction } from "$server/http/guards.js";
import { RATE_LIMITS } from "$server/http/rateLimit.js";
import { HTTP } from "$server/http/status.js";


export const actions = {
	profile: async (event) => {
		const form = await event.request.formData();
		const input = { displayName: String(form.get("displayName") || ""), email: String(form.get("email") || "") };
		const result = await updateAccountProfile(event.locals.user.id, input);
		if (!result.ok) {
			return fail(HTTP.badRequest, { profile: { errors: result.errors, values: input } });
		}
		return { profile: { saved: true } };
	},

	password: async (event) => {
		const limited = await limitFormAction(event, "account-password", RATE_LIMITS.accountChange, String(event.locals.user.id));
		if (limited) {
			return fail(HTTP.tooManyRequests, { password: { errors: { currentPassword: limited.data.message } } });
		}
		const form = await event.request.formData();
		const result = await changeAccountPassword(event.locals.user.id, {
			currentPassword: String(form.get("currentPassword") || ""),
			newPassword: String(form.get("newPassword") || ""),
			confirmPassword: String(form.get("confirmPassword") || "")
		});
		if (!result.ok) {
			return fail(HTTP.badRequest, { password: { errors: result.errors } });
		}
		await endOtherSessions(event.locals.user.id, event.locals.sessionToken);
		return { password: { saved: true } };
	}
};
