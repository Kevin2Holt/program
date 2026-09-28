/*
	PUT: edit or reschedule a booking.
	POST: { action: "cancel" | "restore" }.
*/
import { error } from "@sveltejs/kit";
import { loadEventAccess, parseIdParam } from "$server/http/eventAccess.js";
import { readJsonBody, respondWithResult } from "$server/http/respond.js";
import { HTTP } from "$server/http/status.js";
import { cancelBooking, restoreBooking, updateBooking } from "$server/services/calendarBookingAdminService.js";
import { PERMISSION } from "$server/services/permissionService.js";


function readBookingId(params) {

	const bookingId = parseIdParam(params.bookingId);
	if (!bookingId) {
		error(HTTP.notFound, "Booking not found");
	}
	return bookingId;
}

export async function PUT(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarEditBookings);
	const body = await readJsonBody(event.request);
	return respondWithResult(await updateBooking(access.event.id, readBookingId(event.params), body.booking || {}, access.user.id));
}

export async function POST(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarEditBookings);
	const body = await readJsonBody(event.request);
	const bookingId = readBookingId(event.params);
	if (body.action === "cancel") {
		return respondWithResult(await cancelBooking(access.event.id, bookingId, access.user.id));
	}
	if (body.action === "restore") {
		return respondWithResult(await restoreBooking(access.event.id, bookingId, access.user.id));
	}
	error(HTTP.badRequest, "Unknown action");
}
