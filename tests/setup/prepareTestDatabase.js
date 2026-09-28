/*
	Vitest global setup: rebuild the test database from migrations once per run.
	Refuses to run against anything but TEST_DATABASE_URL.
*/
import dotenv from "dotenv";
import postgres from "postgres";
import { resetDatabase } from "../../scripts/lib/migrations.js";


dotenv.config({ quiet: true });


export default async function prepareTestDatabase() {

	const url = process.env.TEST_DATABASE_URL;
	if (!url) {
		throw new Error("TEST_DATABASE_URL is not set. Copy .env.example to .env.");
	}
	if (url === process.env.DATABASE_URL) {
		throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL; tests wipe their database.");
	}
	const sql = postgres(url, { onnotice: () => {}, max: 1 });
	try {
		await resetDatabase(sql);
	}
	finally {
		await sql.end();
	}
}
