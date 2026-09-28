import { loadEventAccess } from "$server/http/eventAccess.js";
import { PERMISSION } from "$server/services/permissionService.js";


export async function load(event) {

	await loadEventAccess(event, PERMISSION.programView);
	return {};
}
