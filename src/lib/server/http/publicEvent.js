/*
	Shared loader for public code routes (/[code], /[code]/calendar, …).
	Old codes redirect (308) to the same path under the current code; unknown or
	archived codes are a 404.
*/
import { error, redirect } from "@sveltejs/kit";
import { resolvePublicEvent } from "../services/eventService.js";
import { HTTP } from "./status.js";


export async function loadPublicEvent({ params, url }) {

	const resolution = await resolvePublicEvent(params.code);
	if (!resolution) {
		error(HTTP.notFound, "Not found");
	}
	if ("redirectCode" in resolution) {
		const rest = url.pathname.slice(`/${params.code}`.length);
		redirect(HTTP.permanentRedirect, `/${resolution.redirectCode}${rest}${url.search}`);
	}
	return resolution.event;
}
