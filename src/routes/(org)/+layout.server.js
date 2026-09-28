/* Every organizer page requires a signed-in user. */
import { requireUser } from "$server/http/guards.js";


export function load(event) {

	return { user: requireUser(event) };
}
