import { fail, redirect } from "@sveltejs/kit";
import { loadEventAccess } from "$server/http/eventAccess.js";
import { HTTP } from "$server/http/status.js";
import { buildOrganizerWeek } from "$server/services/calendarAvailabilityService.js";
import { createCalendar } from "$server/services/calendarConfigService.js";
import { PERMISSION } from "$server/services/permissionService.js";
import { describeRuleTitle } from "$lib/calendar/describeRule.js";


export async function load(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarView);
	const week = await buildOrganizerWeek(access.event.id, event.url.searchParams.get("week"));
	if (!week) {
		return { overview: null, canCreate: access.permissions.includes(PERMISSION.calendarEdit) };
	}
	const { context, ...rest } = week;
	return {
		overview: {
			...rest,
			config: context.config,
			items: context.items.filter((item) => !item.archived),
			ruleTitles: Object.fromEntries(context.rules.map((rule) => [rule.id, describeRuleTitle(rule)]))
		},
		canCreate: false
	};
}

export const actions = {
	create: async (event) => {
		const access = await loadEventAccess(event, PERMISSION.calendarEdit);
		const form = await event.request.formData();
		const result = await createCalendar(access.event.id, { timeZone: String(form.get("timeZone") || "") });
		if (!result.ok) {
			return fail(HTTP.badRequest, { message: result.message });
		}
		redirect(HTTP.seeOther, `/events/${access.event.id}/calendar/setup?created=1`);
	}
};
