/* Resolves the event for every public page under /[code], and whether it has a public calendar. */
import { loadPublicEvent } from "$server/http/publicEvent.js";
import { loadCalendarConfig } from "$server/services/calendarConfigService.js";


export async function load(event) {

	const publicEvent = await loadPublicEvent(event);
	const config = await loadCalendarConfig(publicEvent.id);
	const hasCalendar = Boolean(config) && config.status !== "draft";
	return {
		publicEvent: { id: publicEvent.id, name: publicEvent.name, code: publicEvent.code },
		hasCalendar,
		calendarTitle: hasCalendar ? config.title : "",
		calendarOpen: hasCalendar && config.status === "open"
	};
}
