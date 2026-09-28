import { fail } from "@sveltejs/kit";
import { loadEventAccess } from "$server/http/eventAccess.js";
import { HTTP } from "$server/http/status.js";
import { archiveEvent, listEventOldCodes, setEventAccent, updateEventSettings } from "$server/services/eventService.js";
import { PERMISSION } from "$server/services/permissionService.js";


export async function load(event) {

	const access = await loadEventAccess(event, PERMISSION.eventManage);
	return { oldCodes: await listEventOldCodes(access.event.id) };
}

export const actions = {
	save: async (event) => {
		const access = await loadEventAccess(event, PERMISSION.eventManage);
		const form = await event.request.formData();
		const input = { name: String(form.get("name") || ""), code: String(form.get("code") || "") };
		const result = await updateEventSettings(access.event.id, input);
		if (!result.ok) {
			return fail(HTTP.badRequest, { errors: result.errors, values: input });
		}
		return { saved: true, codeChanged: result.value.codeChanged };
	},

	accent: async (event) => {
		const access = await loadEventAccess(event, PERMISSION.eventManage);
		const form = await event.request.formData();
		const result = await setEventAccent(access.event.id, String(form.get("accentColor") || ""));
		if (!result.ok) {
			return fail(HTTP.badRequest, { errors: result.errors });
		}
		return { accentSaved: true };
	},

	archive: async (event) => {
		const access = await loadEventAccess(event, PERMISSION.eventManage);
		const form = await event.request.formData();
		const archived = form.get("archived") === "true";
		await archiveEvent(access.event.id, archived);
		return { archived };
	}
};
