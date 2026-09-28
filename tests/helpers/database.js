/* Test helpers for the real test database. */
import { sql } from "../../src/lib/server/db.js";


// Empties every app table (keeps the migration record) so each test starts clean.
export async function clearAllTables() {

	const tables = await sql`
		select tablename from pg_tables
		where schemaname = 'public' and tablename <> 'schema_migrations'`;
	if (tables.length) {
		await sql.unsafe(`truncate ${tables.map((row) => `"${row.tablename}"`).join(", ")} restart identity cascade`);
	}
}

export { sql };
