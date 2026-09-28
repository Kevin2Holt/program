/* The landing page sends signed-in organizers straight to their events. */
import { redirect } from "@sveltejs/kit";
import { HTTP } from "$server/http/status.js";


export function load({ locals }) {

	if (locals.user) {
		redirect(HTTP.seeOther, "/dashboard");
	}
}
