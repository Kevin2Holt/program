/* POST: submit a public signup. Rate-limited; every rule is re-checked on the server. */
import { error } from "@sveltejs/kit";
import { limitEndpoint } from "$server/http/guards.js";
import { RATE_LIMITS } from "$server/http/rateLimit.js";
import { readJsonBody, respondWithResult } from "$server/http/respond.js";
import { HTTP } from "$server/http/status.js";
import { createBooking } from "$server/services/calendarBookingService.js";
import { resolvePublicEvent } from "$server/services/eventService.js";


export async function POST(event) {

	await limitEndpoint(event, "public-booking", RATE_LIMITS.publicBooking);
	const resolution = await resolvePublicEvent(event.params.code);
	if (!resolution || !("event" in resolution)) {
		error(HTTP.notFound, "Not found");
	}
	const body = await readJsonBody(event.request);
	const result = await createBooking(resolution.event, body, {});
	// Only the reference goes back; the booking row and calendar config stay on the server.
	const publicResult = result.ok ? { ...result, value: { reference: result.value.reference } } : result;
	return respondWithResult(publicResult, HTTP.created);
}
