/*
	Fixed-window rate limits stored in Postgres, so limits survive restarts and
	need no extra service. Used for auth and every public write.
*/
import { config } from "../config.js";
import { sql } from "../db.js";


const MS_PER_SECOND = 1000;
const STALE_BUCKET_CLEANUP_CHANCE = 0.01;
const STALE_BUCKET_AGE = "1 day";

export const RATE_LIMITS = {
	login: { limit: 10, windowS: 15 * 60 },
	signup: { limit: 5, windowS: 60 * 60 },
	accountChange: { limit: 10, windowS: 15 * 60 },
	publicBooking: { limit: 10, windowS: 10 * 60 },
	publicRead: { limit: 120, windowS: 60 }
};


function findWindowStart(nowMs, windowS) {

	const windowMs = windowS * MS_PER_SECOND;
	return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

async function removeStaleBucketsSometimes() {

	if (Math.random() < STALE_BUCKET_CLEANUP_CHANCE) {
		await sql`delete from rate_limit_buckets where window_start < now() - ${STALE_BUCKET_AGE}::interval`;
	}
}

// Records one hit for key and says whether it is within the limit.
export async function recordRateLimitHit(key, { limit, windowS }) {

	const nowMs = Date.now();
	const windowStart = findWindowStart(nowMs, windowS);
	const [row] = await sql`
		insert into rate_limit_buckets (bucket_key, window_start, hits)
		values (${key}, ${windowStart}, 1)
		on conflict (bucket_key, window_start) do update set hits = rate_limit_buckets.hits + 1
		returning hits`;
	await removeStaleBucketsSometimes();
	const retryAfterS = Math.ceil((windowStart.getTime() + windowS * MS_PER_SECOND - nowMs) / MS_PER_SECOND);
	return { allowed: row.hits <= limit * config.rateLimitScale, retryAfterS };
}

export function buildRateLimitKey(scope, clientAddress, extra = "") {

	return `${scope}:${clientAddress}${extra ? ":" + extra : ""}`;
}
