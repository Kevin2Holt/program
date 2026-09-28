/* The confirmation page, reachable only through its opaque reference. */
import { error } from "@sveltejs/kit";
import { HTTP } from "$server/http/status.js";
import { buildConfirmationUrl, loadConfirmation } from "$server/services/calendarBookingService.js";
import { loadCalendarConfig } from "$server/services/calendarConfigService.js";
import { loadItemIdentities } from "$server/services/calendarItemService.js";


export async function load({ params, parent, setHeaders }) {

	const { publicEvent } = await parent();
	const confirmation = await loadConfirmation(publicEvent.id, params.ref);
	if (!confirmation) {
		error(HTTP.notFound, "Not found");
	}
	const config = await loadCalendarConfig(publicEvent.id);
	// Personal details: never cache or index.
	setHeaders({ "cache-control": "private, no-store", "x-robots-tag": "noindex" });
	const { booking, selections } = confirmation;
	return {
		confirmation: {
			name: booking.name,
			email: booking.email,
			emailSent: Boolean(booking.emailSentAt),
			canceled: booking.status === "canceled",
			selections,
			link: buildConfirmationUrl(publicEvent.code, booking.reference),
			icsPath: `/${publicEvent.code}/calendar/confirmation/${booking.reference}/calendar.ics`,
			itemsById: await loadItemIdentities(publicEvent.id),
			icsEnabled: Boolean(config?.icsEnabled),
			timeZone: config?.timeZone || "",
			calendarTitle: config?.title || ""
		}
	};
}
