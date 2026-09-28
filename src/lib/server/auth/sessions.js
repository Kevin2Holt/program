/*
	Session lifecycle: create on login/signup, resolve on each request (sliding
	expiry), and destroy on logout. The browser holds a random token; the
	database holds only its SHA-256 hash.
*/
import crypto from "node:crypto";
import { deleteOtherSessionsForUser, deleteSession, extendSession, findLiveSessionUser, insertSession } from "../data/sessions.js";


export const SESSION_COOKIE = "progr_session";
const SESSION_TOKEN_BYTES = 32;
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
// Refresh the expiry at most once a day so most requests don't write.
const SESSION_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;


export function hashSessionToken(token) {

	return crypto.createHash("sha256").update(token).digest();
}

function buildExpiryDate(fromMs = Date.now()) {

	return new Date(fromMs + SESSION_LIFETIME_MS);
}

export async function startSession(userId) {

	const token = crypto.randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
	const expiresAt = buildExpiryDate();
	await insertSession({ tokenHash: hashSessionToken(token), userId, expiresAt });
	return { token, expiresAt };
}

export async function resolveSession(token) {

	if (!token) {
		return null;
	}
	const tokenHash = hashSessionToken(token);
	const row = await findLiveSessionUser(tokenHash);
	if (!row) {
		return null;
	}

	let expiresAt = row.expires_at;
	if (Date.now() - new Date(row.last_seen_at).getTime() > SESSION_REFRESH_AFTER_MS) {
		expiresAt = buildExpiryDate();
		await extendSession(tokenHash, expiresAt);
	}
	return {
		user: { id: row.user_id, email: row.email, displayName: row.display_name },
		expiresAt
	};
}

export async function endSession(token) {

	if (token) {
		await deleteSession(hashSessionToken(token));
	}
}

export async function endOtherSessions(userId, keepToken) {

	await deleteOtherSessionsForUser(userId, hashSessionToken(keepToken));
}

export function buildSessionCookieOptions(expiresAt, isProduction) {

	return {
		path: "/",
		httpOnly: true,
		sameSite: "lax",
		secure: isProduction,
		expires: expiresAt
	};
}
