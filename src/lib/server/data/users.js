/*
	Data access for users. Thin: queries only, no rules.
*/
import { sql } from "../db.js";


const PUBLIC_USER_COLUMNS = sql`id, email, display_name, created_at`;


export async function findUserById(userId) {

	const [user] = await sql`select ${PUBLIC_USER_COLUMNS} from users where id = ${userId}`;
	return user || null;
}

export async function findUserWithHashByEmail(email) {

	const [user] = await sql`select id, email, display_name, password_hash from users where lower(email) = lower(${email})`;
	return user || null;
}

export async function findPasswordHashByUserId(userId) {

	const [row] = await sql`select password_hash from users where id = ${userId}`;
	return row ? row.password_hash : null;
}

export async function checkEmailTaken(email, exceptUserId = null) {

	const [row] = await sql`
		select 1 from users
		where lower(email) = lower(${email}) and (${exceptUserId}::int is null or id <> ${exceptUserId})`;
	return Boolean(row);
}

export async function insertUser({ email, displayName, passwordHash }) {

	const [user] = await sql`
		insert into users (email, display_name, password_hash)
		values (${email}, ${displayName}, ${passwordHash})
		returning ${PUBLIC_USER_COLUMNS}`;
	return user;
}

export async function updateUserProfile(userId, { email, displayName }) {

	const [user] = await sql`
		update users set email = ${email}, display_name = ${displayName}, updated_at = now()
		where id = ${userId}
		returning ${PUBLIC_USER_COLUMNS}`;
	return user || null;
}

export async function updateUserPasswordHash(userId, passwordHash) {

	await sql`update users set password_hash = ${passwordHash}, updated_at = now() where id = ${userId}`;
}
