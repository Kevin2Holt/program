/*
	PUT: update an Item and its times.
	POST: { action: "archive" | "restore" | "move", direction? } for the smaller actions.
*/
import { error } from "@sveltejs/kit";
import { loadEventAccess, parseIdParam } from "$server/http/eventAccess.js";
import { readJsonBody, respondWithResult } from "$server/http/respond.js";
import { HTTP } from "$server/http/status.js";
import { archiveCalendarItem, moveCalendarItem, saveCalendarItem } from "$server/services/calendarItemService.js";
import { PERMISSION } from "$server/services/permissionService.js";


function readItemId(params) {

	const itemId = parseIdParam(params.itemId);
	if (!itemId) {
		error(HTTP.notFound, "Item not found");
	}
	return itemId;
}

export async function PUT(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarEditItems);
	const body = await readJsonBody(event.request);
	const result = await saveCalendarItem(access.event.id, readItemId(event.params), body.item);
	return respondWithResult(result.ok ? { ok: true, value: { item: result.value } } : result);
}

export async function POST(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarEditItems);
	const body = await readJsonBody(event.request);
	const itemId = readItemId(event.params);
	if (body.action === "move") {
		return respondWithResult(await moveCalendarItem(access.event.id, itemId, body.direction === "up" ? -1 : 1));
	}
	if (body.action === "archive" || body.action === "restore") {
		return respondWithResult(await archiveCalendarItem(access.event.id, itemId, body.action === "archive"));
	}
	error(HTTP.badRequest, "Unknown action");
}
