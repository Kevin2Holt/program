/*
	PUT: update a rule. DELETE: delete it for good.
	POST: { active } to activate or deactivate.
*/
import { error } from "@sveltejs/kit";
import { loadEventAccess, parseIdParam } from "$server/http/eventAccess.js";
import { readJsonBody, respondWithResult } from "$server/http/respond.js";
import { HTTP } from "$server/http/status.js";
import { deleteCalendarRule, saveCalendarRule, setCalendarRuleActive } from "$server/services/calendarRuleService.js";
import { PERMISSION } from "$server/services/permissionService.js";


function readRuleId(params) {

	const ruleId = parseIdParam(params.ruleId);
	if (!ruleId) {
		error(HTTP.notFound, "Rule not found");
	}
	return ruleId;
}

export async function PUT(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarEditAvailability);
	const body = await readJsonBody(event.request);
	const result = await saveCalendarRule(access.event.id, readRuleId(event.params), body.rule);
	return respondWithResult(result.ok ? { ok: true, value: { rule: result.value } } : result);
}

export async function POST(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarEditAvailability);
	const body = await readJsonBody(event.request);
	return respondWithResult(await setCalendarRuleActive(access.event.id, readRuleId(event.params), body.active));
}

export async function DELETE(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarEditAvailability);
	return respondWithResult(await deleteCalendarRule(access.event.id, readRuleId(event.params)));
}
