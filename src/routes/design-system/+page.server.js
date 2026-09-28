/* Development-only gallery of every component. Hidden in production. */
import { error } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { HTTP } from "$server/http/status.js";


export function load() {

	if (!dev) {
		error(HTTP.notFound, "Not found");
	}
	return {};
}
