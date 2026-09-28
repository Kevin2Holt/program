/*
	Loads the event for every page under /events/[eventId]; non-members get 404.
	Also builds the Calendar section of the sidebar (only links the member may use).
*/
import { loadEventAccess, toClientEvent } from "$server/http/eventAccess.js";
import { buildPublicUrl } from "$server/publicUrl.js";
import { loadCalendarConfig, loadCalendarNavCounts } from "$server/services/calendarConfigService.js";
import { PERMISSION } from "$server/services/permissionService.js";


const CALENDAR_LINKS = [
	{ key: "overview", path: "", label: "Overview", icon: "grid", permission: PERMISSION.calendarView, exact: true },
	{ key: "setup", path: "/setup", label: "Setup", icon: "calendar", permission: PERMISSION.calendarEdit },
	{ key: "items", path: "/items", label: "Items", icon: "shapes", permission: PERMISSION.calendarEditItems },
	{ key: "availability", path: "/availability", label: "Availability", icon: "shield-check", permission: PERMISSION.calendarEditAvailability },
	{ key: "bookings", path: "/bookings", label: "Bookings", icon: "ticket", permission: PERMISSION.calendarViewDetails },
	{ key: "export", path: "/export", label: "Export", icon: "download", permission: PERMISSION.calendarExport }
];


export async function load(event) {

	const access = await loadEventAccess(event, null);
	const eventId = access.event.id;
	const config = access.permissions.includes(PERMISSION.calendarView) ? await loadCalendarConfig(eventId) : null;
	const base = `/events/${eventId}/calendar`;
	const calendarNav = config
		? CALENDAR_LINKS.filter((link) => access.permissions.includes(link.permission)).map((link) => ({ key: link.key, href: base + link.path, label: link.label, icon: link.icon, exact: link.exact }))
		: access.permissions.includes(PERMISSION.calendarEdit) ? [{ key: "overview", href: base, label: "Add a calendar", icon: "calendar-plus", exact: true }] : null;

	return {
		event: toClientEvent(access.event),
		permissions: access.permissions,
		publicUrl: buildPublicUrl(`/${access.event.code}`),
		hasCalendar: Boolean(config),
		calendarNav,
		navCounts: config ? await loadCalendarNavCounts(eventId) : {}
	};
}
