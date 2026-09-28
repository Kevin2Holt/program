/*
	Permissions are explicit strings checked by every organizer route and API.
	Namespaces: event.*, program.*, calendar.* (never more than three levels).
	Today only the owner role is used and it holds everything; editor and viewer
	are defined so invites can be added by changing only ROLE_PERMISSIONS.
*/


export const PERMISSION = {
	eventManage: "event.manage",
	programView: "program.view",
	programEdit: "program.edit",
	programPublish: "program.publish",
	calendarView: "calendar.view",
	calendarViewDetails: "calendar.view.details",
	calendarEdit: "calendar.edit",
	calendarEditItems: "calendar.edit.items",
	calendarEditAvailability: "calendar.edit.availability",
	calendarEditBookings: "calendar.edit.bookings",
	calendarExport: "calendar.export"
};

export const ROLE = { owner: "owner", editor: "editor", viewer: "viewer" };

const ALL_PERMISSIONS = Object.values(PERMISSION);

const ROLE_PERMISSIONS = {
	[ROLE.owner]: ALL_PERMISSIONS,
	[ROLE.editor]: ALL_PERMISSIONS.filter((permission) => permission !== PERMISSION.eventManage),
	[ROLE.viewer]: [PERMISSION.programView, PERMISSION.calendarView]
};


export function listPermissionsForRole(role) {

	return ROLE_PERMISSIONS[role] || [];
}

export function checkRoleHasPermission(role, permission) {

	return listPermissionsForRole(role).includes(permission);
}
