/* POST: export bookings. { options, preview } → preview rows as JSON, or the CSV file. */
import { todayInTimeZone } from "$lib/dates.js";
import { loadEventAccess } from "$server/http/eventAccess.js";
import { readJsonBody, respondWithResult } from "$server/http/respond.js";
import { buildExport } from "$server/services/calendarExportService.js";
import { PERMISSION } from "$server/services/permissionService.js";


export async function POST(event) {

	const access = await loadEventAccess(event, PERMISSION.calendarExport);
	const body = await readJsonBody(event.request);
	const result = await buildExport(access.event.id, body.options, { preview: Boolean(body.preview) });
	if (!result.ok || body.preview) {
		return respondWithResult(result.ok ? { ok: true, value: { header: result.value.header, rows: result.value.rows, rowCount: result.value.rowCount } } : result);
	}
	const filename = `${access.event.code}-signups-${todayInTimeZone("UTC")}.csv`;
	return new Response(result.value.csv, {
		headers: {
			"content-type": "text/csv; charset=utf-8",
			"content-disposition": `attachment; filename="${filename}"`,
			"cache-control": "private, no-store"
		}
	});
}
