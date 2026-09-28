/*
	npm run db:migrate | db:rollback | db:status | db:reset:test
	Usage: node scripts/migrate.js <up|down|status|reset> [--test]
	--test targets TEST_DATABASE_URL instead of DATABASE_URL.
*/
import dotenv from "dotenv";
import postgres from "postgres";
import { applyPendingMigrations, listAppliedMigrations, listMigrationNames, resetDatabase, rollBackLastMigration } from "./lib/migrations.js";


const EXIT_FAILURE = 1;

dotenv.config({ quiet: true });


function pickDatabaseUrl(useTestDatabase) {

	const url = useTestDatabase ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
	if (!url) {
		throw new Error(`${useTestDatabase ? "TEST_DATABASE_URL" : "DATABASE_URL"} is not set. Copy .env.example to .env.`);
	}
	return url;
}

async function runCommand(command, sql) {

	const log = (line) => console.log(line);
	if (command === "up") {
		const applied = await applyPendingMigrations(sql, log);
		log(applied.length ? `${applied.length} migration(s) applied` : "already up to date");
	}
	else if (command === "down") {
		await rollBackLastMigration(sql, log);
	}
	else if (command === "status") {
		const applied = new Set(await listAppliedMigrations(sql));
		listMigrationNames().forEach((name) => log(`${applied.has(name) ? "applied" : "pending"}  ${name}`));
	}
	else if (command === "reset") {
		await resetDatabase(sql, log);
		log("database reset");
	}
	else {
		throw new Error(`Unknown command "${command}". Use up, down, status, or reset.`);
	}
}


const [command = "up", ...flags] = process.argv.slice(2);
const useTestDatabase = flags.includes("--test");

if (command === "reset" && !useTestDatabase && !flags.includes("--dev")) {
	console.error("Refusing to reset the development database without --dev.");
	process.exit(EXIT_FAILURE);
}

const sql = postgres(pickDatabaseUrl(useTestDatabase), { onnotice: () => {}, max: 1 });

try {
	await runCommand(command, sql);
}
catch (err) {
	console.error(err.message);
	process.exitCode = EXIT_FAILURE;
}
finally {
	await sql.end();
}
