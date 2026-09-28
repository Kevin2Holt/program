/* Public signup calendar. Draft calendars aren't public (404). */
import { error } from "@sveltejs/kit";
import { HTTP } from "$server/http/status.js";
import { buildPublicCalendar } from "$server/services/calendarAvailabilityService.js";


export async function load({ parent }) {

	const { publicEvent } = await parent();
	const calendar = await buildPublicCalendar(publicEvent.id);
	if (!calendar) {
		error(HTTP.notFound, "Not found");
	}
	return { calendar };
}
