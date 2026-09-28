/* The add-to-calendar file for a confirmation (when the organizer offers it). */
import { error } from "@sveltejs/kit";
import { loadPublicEvent } from "$server/http/publicEvent.js";
import { HTTP } from "$server/http/status.js";
import { buildIcs } from "$server/ics.js";
import { buildConfirmationUrl, loadConfirmation } from "$server/services/calendarBookingService.js";
import { loadCalendarConfig } from "$server/services/calendarConfigService.js";


export async function GET(event) {

	const publicEvent = await loadPublicEvent(event);
	const [confirmation, config] = await Promise.all([loadConfirmation(publicEvent.id, event.params.ref), loadCalendarConfig(publicEvent.id)]);
	if (!confirmation || !config?.icsEnabled || confirmation.booking.status !== "active") {
		error(HTTP.notFound, "Not found");
	}
	const body = buildIcs({
		eventName: publicEvent.name,
		calendarTitle: config.title,
		timeZone: config.timeZone,
		reference: confirmation.booking.reference,
		confirmationUrl: buildConfirmationUrl(publicEvent.code, confirmation.booking.reference),
		selections: confirmation.selections,
		mode: config.icsMode
	});
	return new Response(body, {
		headers: {
			"content-type": "text/calendar; charset=utf-8",
			"content-disposition": `attachment; filename="${publicEvent.code}-signup.ics"`,
			"cache-control": "private, no-store"
		}
	});
}
