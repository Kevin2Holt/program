/* Every organizer page requires a signed-in user; the sidebar's event switcher needs their events. */
import { requireUser } from "$server/http/guards.js";
import { toClientEvent } from "$server/http/eventAccess.js";
import { listMemberEvents } from "$server/services/eventService.js";
import { config } from "$server/config.js";


export async function load(event) {

	const user = requireUser(event);
	const events = await listMemberEvents(user.id);
	return {
		user,
		memberEvents: events.map(toClientEvent),
		publicHost: config.publicBaseUrl.replace(/^https?:\/\//, "")
	};
}
