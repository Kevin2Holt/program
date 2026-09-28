/*
	The single Postgres client. Queries use postgres.js tagged templates, which
	always send values as parameters (never string-built SQL).

	Type choices (why): DATE comes back as a "YYYY-MM-DD" string and TIME as
	"HH:MM:SS", so calendar dates never pass through JS Date objects and can't
	shift by a day with the server's time zone. Ids are integers, so they come
	back as JS numbers and compare correctly.
*/
import postgres from "postgres";
import { config } from "./config.js";


const PG_TYPE_DATE = 1082;
const PG_TYPE_TIME = 1083;
const MAX_CONNECTIONS = 10;
const IDLE_TIMEOUT_S = 30;

// Postgres SQLSTATE codes the services react to (reference key: PG error codes appendix).
export const PG_ERROR = {
	uniqueViolation: "23505",
	foreignKeyViolation: "23503",
	checkViolation: "23514"
};


function passThrough(value) {

	return value;
}


export const sql = postgres(config.databaseUrl, {
	max: MAX_CONNECTIONS,
	idle_timeout: IDLE_TIMEOUT_S,
	onnotice: () => {},
	types: {
		date: { to: PG_TYPE_DATE, from: [PG_TYPE_DATE], serialize: passThrough, parse: passThrough },
		time: { to: PG_TYPE_TIME, from: [PG_TYPE_TIME], serialize: passThrough, parse: passThrough }
	}
});
