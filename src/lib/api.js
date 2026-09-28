/*
	Browser helper for the JSON API. Adds the CSRF header and always resolves to
	{ ok, …data } so callers handle failures without try/catch. Network errors
	become { ok: false, code: "network" }.
*/


export const NETWORK_ERROR_MESSAGE = "Couldn't reach the server. Check your connection and try again.";


export async function sendJson(method, url, csrfToken, body = undefined) {

	try {
		const response = await fetch(url, {
			method,
			headers: { "content-type": "application/json", accept: "application/json", "x-csrf-token": csrfToken },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		const data = await response.json().catch(() => ({}));
		if (!response.ok) {
			return { ok: false, code: data.code || String(response.status), message: data.message || "Something went wrong.", errors: data.errors || {} };
		}
		return { ok: true, ...data };
	}
	catch {
		return { ok: false, code: "network", message: NETWORK_ERROR_MESSAGE, errors: {} };
	}
}
