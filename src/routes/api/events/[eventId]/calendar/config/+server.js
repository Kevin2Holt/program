/* PATCH: autosave calendar setup (partial changes; the merged config is validated). */
import { loadEventAccess } from "$server/http/eventAccess.js";
import { readJsonBody, respondWithResult } from "$server/http/respond.js";
import { updateCalendarConfig } from "$server/services/calendarConfigService.js";
import { PERMISSION } from "$server/services/permissionService.js";


export async function PATCH(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarEdit);
	const body = await readJsonBody(event.request);
	const result = await updateCalendarConfig(access.event.id, body.changes);
	return respondWithResult(result.ok ? { ok: true, value: { config: result.value } } : result);
}
