/* Public program: the published version only. */
import { loadPublishedProgram } from "$server/services/programService.js";


export async function load({ parent }) {

	const { publicEvent } = await parent();
	return { program: await loadPublishedProgram(publicEvent.id) };
}
