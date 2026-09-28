/* POST: create an Item (with its times). */
import { loadEventAccess } from "$server/http/eventAccess.js";
import { readJsonBody, respondWithResult } from "$server/http/respond.js";
import { HTTP } from "$server/http/status.js";
import { saveCalendarItem } from "$server/services/calendarItemService.js";
import { PERMISSION } from "$server/services/permissionService.js";


export async function POST(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarEditItems);
	const body = await readJsonBody(event.request);
	const result = await saveCalendarItem(access.event.id, null, body.item);
	return respondWithResult(result.ok ? { ok: true, value: { item: result.value } } : result, HTTP.created);
}
