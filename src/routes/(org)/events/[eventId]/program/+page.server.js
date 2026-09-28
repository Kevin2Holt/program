import { loadEventAccess } from "$server/http/eventAccess.js";
import { PERMISSION } from "$server/services/permissionService.js";
import { loadEditorState } from "$server/services/programService.js";


export async function load(event) {

	const access = await loadEventAccess(event, PERMISSION.programView);
	return {
		editor: await loadEditorState(access.event.id),
		canEdit: access.permissions.includes(PERMISSION.programEdit),
		canPublish: access.permissions.includes(PERMISSION.programPublish)
	};
}
