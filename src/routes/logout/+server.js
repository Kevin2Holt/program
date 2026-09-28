import { redirect } from "@sveltejs/kit";
import { endSession } from "$server/auth/sessions.js";
import { clearSignInCookies } from "$server/http/authCookies.js";
import { HTTP } from "$server/http/status.js";


export async function POST({ locals, cookies }) {

	await endSession(locals.sessionToken);
	clearSignInCookies(cookies);
	redirect(HTTP.seeOther, "/login");
}
