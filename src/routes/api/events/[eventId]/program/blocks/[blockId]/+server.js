/* PATCH: save a block's content (autosave). DELETE: remove a block. */
import { error } from "@sveltejs/kit";
import { loadEventAccess, parseIdParam } from "$server/http/eventAccess.js";
import { readJsonBody, respondWithResult } from "$server/http/respond.js";
import { HTTP } from "$server/http/status.js";
import { PERMISSION } from "$server/services/permissionService.js";
import { deleteBlock, updateBlock } from "$server/services/programService.js";


function readBlockId(params) {

	const blockId = parseIdParam(params.blockId);
	if (!blockId) {
		error(HTTP.notFound, "Block not found");
	}
	return blockId;
}

export async function PATCH(event) {

	const access = await loadEventAccess(event, PERMISSION.programEdit);
	const body = await readJsonBody(event.request);
	return respondWithResult(await updateBlock(access.event.id, readBlockId(event.params), { content: body.content, html: body.html }));
}

export async function DELETE(event) {

	const access = await loadEventAccess(event, PERMISSION.programEdit);
	return respondWithResult(await deleteBlock(access.event.id, readBlockId(event.params)));
}
