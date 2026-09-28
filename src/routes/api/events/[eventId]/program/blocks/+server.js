/* POST: create a block in the draft (optionally at a position, or restoring content for undo). */
import { loadEventAccess } from "$server/http/eventAccess.js";
import { readJsonBody, respondWithResult } from "$server/http/respond.js";
import { HTTP } from "$server/http/status.js";
import { PERMISSION } from "$server/services/permissionService.js";
import { createBlock } from "$server/services/programService.js";


export async function POST(event) {

	const access = await loadEventAccess(event, PERMISSION.programEdit);
	const body = await readJsonBody(event.request);
	const result = await createBlock(access.event.id, {
		type: body.type,
		position: Number.isInteger(body.position) ? body.position : null,
		content: body.content || null,
		html: typeof body.html === "string" ? body.html : ""
	});
	return respondWithResult(result, HTTP.created);
}
