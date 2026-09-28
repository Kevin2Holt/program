/* PUT: save a new block order (a permutation of the draft's blocks). */
import { loadEventAccess } from "$server/http/eventAccess.js";
import { readJsonBody, respondWithResult } from "$server/http/respond.js";
import { PERMISSION } from "$server/services/permissionService.js";
import { reorderBlocks } from "$server/services/programService.js";


export async function PUT(event) {

	const access = await loadEventAccess(event, PERMISSION.programEdit);
	const body = await readJsonBody(event.request);
	return respondWithResult(await reorderBlocks(access.event.id, body.order));
}
