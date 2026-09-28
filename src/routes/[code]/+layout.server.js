/* Resolves the event for every public page under /[code]. */
import { loadPublicEvent } from "$server/http/publicEvent.js";


export async function load(event) {

	const publicEvent = await loadPublicEvent(event);
	return {
		publicEvent: { id: publicEvent.id, name: publicEvent.name, code: publicEvent.code },
		hasCalendar: false,
		calendarTitle: "",
		calendarOpen: false
	};
}
