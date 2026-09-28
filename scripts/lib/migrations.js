/*
	Migration engine shared by scripts/migrate.js and the test setup.
	Migrations are db/migrations/NNN_name.up.sql with a matching .down.sql.
	Each one runs in its own transaction and is recorded in schema_migrations.
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";


const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations");
const UP_SUFFIX = ".up.sql";
const DOWN_SUFFIX = ".down.sql";


export function listMigrationNames() {

	return fs.readdirSync(MIGRATIONS_DIR)
		.filter((file) => file.endsWith(UP_SUFFIX))
		.map((file) => file.slice(0, -UP_SUFFIX.length))
		.sort();
}

function readMigrationSql(name, suffix) {

	const file = path.join(MIGRATIONS_DIR, name + suffix);
	if (!fs.existsSync(file)) {
		throw new Error(`Missing ${name}${suffix}: every migration needs a down step.`);
	}
	return fs.readFileSync(file, "utf8");
}

async function ensureMigrationTable(sql) {

	await sql`
		create table if not exists schema_migrations (
			name text primary key,
			applied_at timestamptz not null default now()
		)`;
}

export async function listAppliedMigrations(sql) {

	await ensureMigrationTable(sql);
	const rows = await sql`select name from schema_migrations order by name`;
	return rows.map((row) => row.name);
}

/** @param {(line: string) => void} [log] */
export async function applyPendingMigrations(sql, log = () => {}) {

	const applied = new Set(await listAppliedMigrations(sql));
	const pending = listMigrationNames().filter((name) => !applied.has(name));
	for (const name of pending) {
		const upSql = readMigrationSql(name, UP_SUFFIX);
		readMigrationSql(name, DOWN_SUFFIX);
		await sql.begin(async (tx) => {
			await tx.unsafe(upSql);
			await tx`insert into schema_migrations (name) values (${name})`;
		});
		log(`applied ${name}`);
	}
	return pending;
}

/** @param {(line: string) => void} [log] */
export async function rollBackLastMigration(sql, log = () => {}) {

	const applied = await listAppliedMigrations(sql);
	const last = applied.at(-1);
	if (!last) {
		log("nothing to roll back");
		return null;
	}
	const downSql = readMigrationSql(last, DOWN_SUFFIX);
	await sql.begin(async (tx) => {
		await tx.unsafe(downSql);
		await tx`delete from schema_migrations where name = ${last}`;
	});
	log(`rolled back ${last}`);
	return last;
}

/** @param {(line: string) => void} [log] */
export async function resetDatabase(sql, log = () => {}) {

	// Drops everything the app owns, then rebuilds from migrations. Test/dev only.
	await sql.unsafe("drop schema if exists public cascade; create schema public;");
	return applyPendingMigrations(sql, log);
}
