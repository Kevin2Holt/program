/* Loads the event for every page under /events/[eventId]; non-members get 404. */
import { loadEventAccess, toClientEvent } from "$server/http/eventAccess.js";
import { buildPublicUrl } from "$server/publicUrl.js";


export async function load(event) {

	const access = await loadEventAccess(event, null);
	return {
		event: toClientEvent(access.event),
		permissions: access.permissions,
		publicUrl: buildPublicUrl(`/${access.event.code}`)
	};
}
