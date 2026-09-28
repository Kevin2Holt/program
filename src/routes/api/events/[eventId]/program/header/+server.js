/* PUT: save the program header (eyebrow, title, date, time, place). */
import { loadEventAccess } from "$server/http/eventAccess.js";
import { readJsonBody, respondWithResult } from "$server/http/respond.js";
import { PERMISSION } from "$server/services/permissionService.js";
import { saveHeader } from "$server/services/programService.js";


export async function PUT(event) {

	const access = await loadEventAccess(event, PERMISSION.programEdit);
	const body = await readJsonBody(event.request);
	return respondWithResult(await saveHeader(access.event.id, body.header));
}
