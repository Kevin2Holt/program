/*
	Capacity bookkeeping. Usage is always counted from stored selections of
	active bookings (never from UI state). An offering is an Item on a date
	(date-only) or one of its times on a date (timed).
*/


export function buildOfferingKey(itemId, date, timeId) {

	return timeId ? `t:${timeId}:${date}` : `i:${itemId}:${date}`;
}

// rows: [{ item_id, time_id, service_date, used }] from the database.
export function buildUsageMap(rows) {

	const usage = new Map();
	for (const row of rows) {
		usage.set(buildOfferingKey(row.item_id, row.service_date, row.time_id), Number(row.used));
	}
	return usage;
}

export function checkHasCapacity(capacity, used) {

	return used < capacity;
}
