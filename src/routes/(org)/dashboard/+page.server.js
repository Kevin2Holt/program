import { fail, redirect } from "@sveltejs/kit";
import { createEvent } from "$server/services/eventService.js";
import { HTTP } from "$server/http/status.js";


export const actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const input = { name: String(form.get("name") || ""), code: String(form.get("code") || "") };
		const result = await createEvent(locals.user.id, input);
		if (!result.ok) {
			return fail(HTTP.badRequest, { create: { errors: result.errors, values: input } });
		}
		redirect(HTTP.seeOther, `/events/${result.value.id}/program?created=1`);
	}
};
