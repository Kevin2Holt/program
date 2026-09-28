/* POST /publish, /unpublish, /rollback: change which version is live. Returns the new status. */
import { loadEventAccess } from "$server/http/eventAccess.js";
import { respondWithResult } from "$server/http/respond.js";
import { PERMISSION } from "$server/services/permissionService.js";
import { loadPublishStatus, publishProgram, rollBackProgram, unpublishProgram } from "$server/services/programService.js";


const ACTIONS = { publish: publishProgram, unpublish: unpublishProgram, rollback: rollBackProgram };


export async function POST(event) {

	const access = await loadEventAccess(event, PERMISSION.programPublish);
	const result = await ACTIONS[event.params.action](access.event.id);
	if (!result.ok) {
		return respondWithResult(result);
	}
	return respondWithResult({ ok: true, value: { status: await loadPublishStatus(access.event.id) } });
}
