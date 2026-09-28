/* The event root has no page of its own; the program is the starting point. */
import { redirect } from "@sveltejs/kit";
import { HTTP } from "$server/http/status.js";


export function load({ params }) {

	redirect(HTTP.seeOther, `/events/${params.eventId}/program`);
}
