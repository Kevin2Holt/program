import { error } from "@sveltejs/kit";
import { todayInTimeZone } from "$lib/dates.js";
import { loadEventAccess } from "$server/http/eventAccess.js";
import { HTTP } from "$server/http/status.js";
import { loadCalendarConfig } from "$server/services/calendarConfigService.js";
import { listCalendarItems, suggestNewItemIdentity } from "$server/services/calendarItemService.js";
import { PERMISSION } from "$server/services/permissionService.js";


export async function load(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarEditItems);
	const config = await loadCalendarConfig(access.event.id);
	if (!config) {
		error(HTTP.notFound, "This event has no calendar yet.");
	}
	return {
		timed: config.timed,
		today: todayInTimeZone(config.timeZone),
		items: await listCalendarItems(access.event.id),
		newItemDefaults: await suggestNewItemIdentity(access.event.id)
	};
}
