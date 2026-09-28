import { loadEventAccess } from "$server/http/eventAccess.js";
import { BOOKINGS_PAGE_SIZE, listBookingsPage } from "$server/services/calendarBookingAdminService.js";
import { loadItemIdentities } from "$server/services/calendarItemService.js";
import { PERMISSION } from "$server/services/permissionService.js";


export async function load(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarViewDetails);
	const query = Object.fromEntries(event.url.searchParams);
	return {
		query,
		pageSize: BOOKINGS_PAGE_SIZE,
		listing: await listBookingsPage(access.event.id, query),
		itemsById: await loadItemIdentities(access.event.id)
	};
}
