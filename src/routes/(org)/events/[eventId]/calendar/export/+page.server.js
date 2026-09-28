import { loadEventAccess } from "$server/http/eventAccess.js";
import { loadCalendarContext } from "$server/services/calendarAvailabilityService.js";
import { PERMISSION } from "$server/services/permissionService.js";
import { todayInTimeZone } from "$lib/dates.js";


export async function load(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarExport);
	const context = await loadCalendarContext(access.event.id);
	return {
		items: (context?.items || []).map(({ id, name, color, shape, glyph, archived }) => ({ id, name, color, shape, glyph, archived })),
		timed: Boolean(context?.config.timed),
		today: context ? todayInTimeZone(context.config.timeZone) : ""
	};
}
