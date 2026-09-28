/*
	Loads the event named by params.eventId for the signed-in organizer and
	checks one explicit permission. Non-members get 404 (events aren't
	revealed to outsiders); members lacking the permission get 403.
*/
import { error } from "@sveltejs/kit";
import { loadMembership } from "../services/eventService.js";
import { listPermissionsForRole } from "../services/permissionService.js";
import { requireUser } from "./guards.js";
import { HTTP } from "./status.js";


const ID_PATTERN = /^\d{1,9}$/;


export function parseIdParam(value) {

	return ID_PATTERN.test(value || "") ? Number(value) : null;
}

export async function loadEventAccess(event, permission) {

	const user = requireUser(event);
	const eventId = parseIdParam(event.params.eventId);
	const membership = eventId ? await loadMembership(eventId, user.id) : null;
	if (!membership) {
		error(HTTP.notFound, "Event not found");
	}
	const permissions = listPermissionsForRole(membership.role);
	if (permission && !permissions.includes(permission)) {
		error(HTTP.forbidden, "You don't have access to this part of the event.");
	}
	const { role, ...eventRow } = membership;
	return { user, event: eventRow, role, permissions };
}

export function toClientEvent(eventRow) {

	return {
		id: eventRow.id,
		name: eventRow.name,
		code: eventRow.code,
		archived: Boolean(eventRow.archived_at),
		updatedAt: eventRow.updated_at
	};
}
