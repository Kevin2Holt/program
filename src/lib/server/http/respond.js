/* Turns service results into JSON responses for the API routes. */
import { error, json } from "@sveltejs/kit";
import { HTTP, HTTP_BY_RESULT_CODE } from "./status.js";


const MAX_JSON_BODY_BYTES = 256 * 1024;


export function respondWithResult(result, successStatus = HTTP.ok) {

	if (result.ok) {
		return json({ ok: true, ...(result.value || {}) }, { status: successStatus });
	}
	return json(
		{ ok: false, code: result.code, message: result.message, errors: result.errors },
		{ status: HTTP_BY_RESULT_CODE[result.code] || HTTP.badRequest }
	);
}

export async function readJsonBody(request) {

	const text = await request.text();
	if (text.length > MAX_JSON_BODY_BYTES) {
		error(HTTP.badRequest, "That request is too large.");
	}
	try {
		return text ? JSON.parse(text) : {};
	}
	catch {
		error(HTTP.badRequest, "That request couldn't be read.");
	}
}
