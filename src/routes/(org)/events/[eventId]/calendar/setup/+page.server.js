import { error } from "@sveltejs/kit";
import { loadEventAccess } from "$server/http/eventAccess.js";
import { HTTP } from "$server/http/status.js";
import { loadCalendarConfig } from "$server/services/calendarConfigService.js";
import { PERMISSION } from "$server/services/permissionService.js";


export async function load(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarEdit);
	const config = await loadCalendarConfig(access.event.id);
	if (!config) {
		error(HTTP.notFound, "This event has no calendar yet.");
	}
	return { config };
}
