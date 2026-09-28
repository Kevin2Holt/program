/* POST: duplicate a block right after itself. */
import { error } from "@sveltejs/kit";
import { loadEventAccess, parseIdParam } from "$server/http/eventAccess.js";
import { respondWithResult } from "$server/http/respond.js";
import { HTTP } from "$server/http/status.js";
import { PERMISSION } from "$server/services/permissionService.js";
import { duplicateBlock } from "$server/services/programService.js";


export async function POST(event) {

	const access = await loadEventAccess(event, PERMISSION.programEdit);
	const blockId = parseIdParam(event.params.blockId);
	if (!blockId) {
		error(HTTP.notFound, "Block not found");
	}
	return respondWithResult(await duplicateBlock(access.event.id, blockId), HTTP.created);
}
