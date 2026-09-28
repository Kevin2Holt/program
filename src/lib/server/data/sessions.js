/*
	Data access for sessions. Tokens are never stored, only their SHA-256 hash.
*/
import { sql } from "../db.js";


export async function insertSession({ tokenHash, userId, expiresAt }) {

	await sql`insert into sessions (token_hash, user_id, expires_at) values (${tokenHash}, ${userId}, ${expiresAt})`;
}

export async function findLiveSessionUser(tokenHash) {

	const [row] = await sql`
		select s.user_id, s.expires_at, s.last_seen_at, u.email, u.display_name
		from sessions s join users u on u.id = s.user_id
		where s.token_hash = ${tokenHash} and s.expires_at > now()`;
	return row || null;
}

export async function extendSession(tokenHash, expiresAt) {

	await sql`update sessions set expires_at = ${expiresAt}, last_seen_at = now() where token_hash = ${tokenHash}`;
}

export async function deleteSession(tokenHash) {

	await sql`delete from sessions where token_hash = ${tokenHash}`;
}

export async function deleteOtherSessionsForUser(userId, keepTokenHash) {

	await sql`delete from sessions where user_id = ${userId} and token_hash <> ${keepTokenHash}`;
}

export async function deleteExpiredSessions() {

	await sql`delete from sessions where expires_at <= now()`;
}
