import { error } from "@sveltejs/kit";
import { todayInTimeZone } from "$lib/dates.js";
import { loadEventAccess, parseIdParam } from "$server/http/eventAccess.js";
import { HTTP } from "$server/http/status.js";
import { loadCalendarContext } from "$server/services/calendarAvailabilityService.js";
import { loadBookingDetails } from "$server/services/calendarBookingAdminService.js";
import { buildConfirmationUrl } from "$server/services/calendarBookingService.js";
import { PERMISSION } from "$server/services/permissionService.js";


export async function load(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarViewDetails);
	const bookingId = parseIdParam(event.params.bookingId);
	const details = bookingId ? await loadBookingDetails(access.event.id, bookingId) : null;
	if (!details) {
		error(HTTP.notFound, "Booking not found");
	}
	const context = await loadCalendarContext(access.event.id);
	return {
		details,
		confirmationUrl: buildConfirmationUrl(access.event.code, details.booking.reference),
		today: todayInTimeZone(context.config.timeZone),
		timed: context.config.timed,
		items: context.items,
		times: context.times,
		canEdit: access.permissions.includes(PERMISSION.calendarEditBookings)
	};
}
