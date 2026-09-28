/* POST: create an availability rule. */
import { loadEventAccess } from "$server/http/eventAccess.js";
import { readJsonBody, respondWithResult } from "$server/http/respond.js";
import { HTTP } from "$server/http/status.js";
import { saveCalendarRule } from "$server/services/calendarRuleService.js";
import { PERMISSION } from "$server/services/permissionService.js";


export async function POST(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarEditAvailability);
	const body = await readJsonBody(event.request);
	const result = await saveCalendarRule(access.event.id, null, body.rule);
	return respondWithResult(result.ok ? { ok: true, value: { rule: result.value } } : result, HTTP.created);
}
