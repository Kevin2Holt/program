import { error } from "@sveltejs/kit";
import { todayInTimeZone } from "$lib/dates.js";
import { loadEventAccess } from "$server/http/eventAccess.js";
import { HTTP } from "$server/http/status.js";
import { loadCalendarConfig } from "$server/services/calendarConfigService.js";
import { listCalendarItems } from "$server/services/calendarItemService.js";
import { listCalendarRules } from "$server/services/calendarRuleService.js";
import { PERMISSION } from "$server/services/permissionService.js";


export async function load(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarEditAvailability);
	const config = await loadCalendarConfig(access.event.id);
	if (!config) {
		error(HTTP.notFound, "This event has no calendar yet.");
	}
	const [items, rules] = await Promise.all([listCalendarItems(access.event.id), listCalendarRules(access.event.id)]);
	return {
		today: todayInTimeZone(config.timeZone),
		items: items.filter((item) => !item.archived).map(({ id, name, color, shape, glyph }) => ({ id, name, color, shape, glyph })),
		allItems: items.map(({ id, name, color, shape, glyph, archived }) => ({ id, name, color, shape, glyph, archived })),
		rules
	};
}
