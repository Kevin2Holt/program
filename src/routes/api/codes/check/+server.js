/* Live availability check for event codes while an organizer types. GET ?code=…&eventId=… */
import { json } from "@sveltejs/kit";
import { requireUser } from "$server/http/guards.js";
import { parseIdParam } from "$server/http/eventAccess.js";
import { checkCodeAvailability, loadMembership } from "$server/services/eventService.js";


export async function GET(event) {

	const user = requireUser(event);
	const eventId = parseIdParam(event.url.searchParams.get("eventId"));
	// Only a member may check a code "for" an event (so its own old codes count as free).
	const exceptEventId = eventId && await loadMembership(eventId, user.id) ? eventId : null;
	const result = await checkCodeAvailability(event.url.searchParams.get("code") || "", exceptEventId);
	return json(result);
}
