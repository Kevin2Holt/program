/*
	Data access for calendar configuration, Items, times, rules, and usage.
	Rows are mapped to camelCase domain objects here, in one place.
	`db` is the shared client or a transaction.
*/
import { normalizeTime } from "$lib/times.js";


export function mapConfigRow(row) {

	return row && {
		eventId: row.event_id,
		title: row.title,
		status: row.status,
		timeZone: row.time_zone,
		windowMode: row.window_mode,
		fixedStart: row.fixed_start,
		fixedEnd: row.fixed_end,
		rollingSize: row.rolling_size,
		rollingUnit: row.rolling_unit,
		minDaysAhead: row.min_days_ahead,
		timed: row.timed,
		preventOverlap: row.prevent_overlap,
		formFields: row.form_fields,
		emailConfirmation: row.email_confirmation,
		icsEnabled: row.ics_enabled,
		icsMode: row.ics_mode,
		updatedAt: row.updated_at
	};
}

export function mapItemRow(row) {

	return {
		id: row.id,
		name: row.name,
		capacity: row.capacity,
		color: row.color,
		shape: row.shape,
		glyph: row.glyph,
		sortOrder: row.sort_order,
		archived: Boolean(row.archived_at),
		archivedAt: row.archived_at
	};
}

export function mapTimeRow(row) {

	return {
		id: row.id,
		itemId: row.item_id,
		startTime: normalizeTime(row.start_time),
		durationMinutes: row.duration_minutes,
		label: row.label,
		capacityOverride: row.capacity_override,
		onlyDate: row.only_date,
		archived: Boolean(row.archived_at)
	};
}

export function mapRuleRow(row) {

	return {
		id: row.id,
		effect: row.effect,
		kind: row.kind,
		onceDate: row.once_date,
		frequency: row.frequency,
		weekdays: row.weekdays || [],
		monthDay: row.month_day,
		monthWeek: row.month_week,
		monthWeekday: row.month_weekday,
		startsOn: row.starts_on,
		endsOn: row.ends_on,
		appliesTo: row.applies_to,
		itemIds: (row.item_ids || []).filter((itemId) => itemId !== null),
		label: row.label,
		active: row.active
	};
}


/* ---------- Config ---------- */

export async function findConfig(db, eventId) {

	const [row] = await db`select * from calendar_configs where event_id = ${eventId}`;
	return mapConfigRow(row || null);
}

export async function insertConfig(db, eventId, values) {

	const [row] = await db`
		insert into calendar_configs (event_id, title, time_zone, form_fields)
		values (${eventId}, ${values.title}, ${values.timeZone}, ${db.json(values.formFields)})
		returning *`;
	return mapConfigRow(row);
}

export async function updateConfigRow(db, eventId, config) {

	const [row] = await db`
		update calendar_configs set
			title = ${config.title}, status = ${config.status}, time_zone = ${config.timeZone},
			window_mode = ${config.windowMode}, fixed_start = ${config.fixedStart}, fixed_end = ${config.fixedEnd},
			rolling_size = ${config.rollingSize}, rolling_unit = ${config.rollingUnit}, min_days_ahead = ${config.minDaysAhead},
			timed = ${config.timed}, prevent_overlap = ${config.preventOverlap}, form_fields = ${db.json(config.formFields)},
			email_confirmation = ${config.emailConfirmation}, ics_enabled = ${config.icsEnabled}, ics_mode = ${config.icsMode},
			updated_at = now()
		where event_id = ${eventId}
		returning *`;
	return mapConfigRow(row);
}


/* ---------- Items and times ---------- */

export async function listItemRows(db, eventId) {

	return (await db`select * from calendar_items where event_id = ${eventId} order by archived_at nulls first, sort_order, id`).map(mapItemRow);
}

export async function findItemRow(db, eventId, itemId) {

	const [row] = await db`select * from calendar_items where event_id = ${eventId} and id = ${itemId}`;
	return row ? mapItemRow(row) : null;
}

export async function countItemsEver(db, eventId) {

	const [row] = await db`select count(*)::int as count, coalesce(max(sort_order), -1)::int as max_order from calendar_items where event_id = ${eventId}`;
	return row;
}

export async function insertItemRow(db, eventId, item) {

	const [row] = await db`
		insert into calendar_items (event_id, name, capacity, color, shape, glyph, sort_order)
		values (${eventId}, ${item.name}, ${item.capacity}, ${item.color}, ${item.shape}, ${item.glyph}, ${item.sortOrder})
		returning *`;
	return mapItemRow(row);
}

export async function updateItemRow(db, eventId, itemId, item) {

	const [row] = await db`
		update calendar_items set name = ${item.name}, capacity = ${item.capacity}, color = ${item.color},
			shape = ${item.shape}, glyph = ${item.glyph}, updated_at = now()
		where event_id = ${eventId} and id = ${itemId}
		returning *`;
	return row ? mapItemRow(row) : null;
}

export async function setItemArchived(db, eventId, itemId, archived) {

	await db`update calendar_items set archived_at = ${archived ? db`now()` : null}, updated_at = now() where event_id = ${eventId} and id = ${itemId}`;
}

export async function setItemSortOrder(db, eventId, itemId, sortOrder) {

	await db`update calendar_items set sort_order = ${sortOrder} where event_id = ${eventId} and id = ${itemId}`;
}

export async function listTimeRows(db, eventId, { includeArchived = false } = {}) {

	const rows = includeArchived
		? await db`select * from calendar_item_times where event_id = ${eventId} order by start_time, id`
		: await db`select * from calendar_item_times where event_id = ${eventId} and archived_at is null order by start_time, id`;
	return rows.map(mapTimeRow);
}

export async function insertTimeRow(db, eventId, itemId, time) {

	await db`
		insert into calendar_item_times (event_id, item_id, start_time, duration_minutes, label, capacity_override, only_date)
		values (${eventId}, ${itemId}, ${time.startTime}, ${time.durationMinutes}, ${time.label}, ${time.capacityOverride}, ${time.onlyDate})`;
}

export async function updateTimeRow(db, eventId, itemId, time) {

	await db`
		update calendar_item_times set start_time = ${time.startTime}, duration_minutes = ${time.durationMinutes}, label = ${time.label},
			capacity_override = ${time.capacityOverride}, only_date = ${time.onlyDate}, archived_at = null, updated_at = now()
		where event_id = ${eventId} and item_id = ${itemId} and id = ${time.id}`;
}

export async function archiveTimesExcept(db, eventId, itemId, keepTimeIds) {

	await db`
		update calendar_item_times set archived_at = now(), updated_at = now()
		where event_id = ${eventId} and item_id = ${itemId} and archived_at is null and not (id = any(${keepTimeIds}::int[]))`;
}


/* ---------- Rules ---------- */

export async function listRuleRows(db, eventId) {

	const rows = await db`
		select r.*, array_agg(ri.item_id order by ri.item_id) as item_ids
		from calendar_rules r left join calendar_rule_items ri on ri.rule_id = r.id
		where r.event_id = ${eventId}
		group by r.id
		order by r.created_at, r.id`;
	return rows.map(mapRuleRow);
}

export async function insertRuleRow(db, eventId, rule) {

	const [row] = await db`
		insert into calendar_rules (event_id, effect, kind, once_date, frequency, weekdays, month_day, month_week, month_weekday, starts_on, ends_on, applies_to, label, active)
		values (${eventId}, ${rule.effect}, ${rule.kind}, ${rule.onceDate}, ${rule.frequency}, ${rule.weekdays}, ${rule.monthDay}, ${rule.monthWeek}, ${rule.monthWeekday},
			${rule.startsOn}, ${rule.endsOn}, ${rule.appliesTo}, ${rule.label}, ${rule.active})
		returning id`;
	return row.id;
}

export async function updateRuleRow(db, eventId, ruleId, rule) {

	const [row] = await db`
		update calendar_rules set effect = ${rule.effect}, kind = ${rule.kind}, once_date = ${rule.onceDate}, frequency = ${rule.frequency},
			weekdays = ${rule.weekdays}, month_day = ${rule.monthDay}, month_week = ${rule.monthWeek}, month_weekday = ${rule.monthWeekday},
			starts_on = ${rule.startsOn}, ends_on = ${rule.endsOn}, applies_to = ${rule.appliesTo}, label = ${rule.label}, active = ${rule.active},
			updated_at = now()
		where event_id = ${eventId} and id = ${ruleId}
		returning id`;
	return Boolean(row);
}

export async function replaceRuleItems(db, eventId, ruleId, itemIds) {

	await db`delete from calendar_rule_items where rule_id = ${ruleId}`;
	for (const itemId of itemIds) {
		await db`insert into calendar_rule_items (event_id, rule_id, item_id) values (${eventId}, ${ruleId}, ${itemId})`;
	}
}

export async function setRuleActiveRow(db, eventId, ruleId, active) {

	const [row] = await db`update calendar_rules set active = ${active}, updated_at = now() where event_id = ${eventId} and id = ${ruleId} returning id`;
	return Boolean(row);
}

export async function deleteRuleRow(db, eventId, ruleId) {

	const [row] = await db`delete from calendar_rules where event_id = ${eventId} and id = ${ruleId} returning id`;
	return Boolean(row);
}


/* ---------- Usage (capacity source of truth) ---------- */

export async function listUsageRows(db, eventId, fromDate, toDate, excludeBookingId = null) {

	return db`
		select s.item_id, s.time_id, s.service_date, count(*)::int as used
		from calendar_selections s join calendar_bookings b on b.id = s.booking_id
		where s.event_id = ${eventId} and b.status = 'active'
			and s.service_date between ${fromDate} and ${toDate}
			and (${excludeBookingId}::int is null or s.booking_id <> ${excludeBookingId})
		group by s.item_id, s.time_id, s.service_date`;
}

export async function countUpcomingSelectionsByItem(db, eventId, fromDate) {

	const rows = await db`
		select s.item_id, count(*)::int as upcoming
		from calendar_selections s join calendar_bookings b on b.id = s.booking_id
		where s.event_id = ${eventId} and b.status = 'active' and s.service_date >= ${fromDate}
		group by s.item_id`;
	return new Map(rows.map((row) => [row.item_id, row.upcoming]));
}

export async function countCalendarSummary(db, eventId) {

	const [row] = await db`
		select
			(select count(*)::int from calendar_items where event_id = ${eventId} and archived_at is null) as items,
			(select count(*)::int from calendar_rules where event_id = ${eventId}) as availability,
			(select count(*)::int from calendar_bookings where event_id = ${eventId} and status = 'active') as bookings`;
	return row;
}

export async function countUpcomingSelections(db, eventId, fromDate) {

	const [row] = await db`
		select count(*)::int as count
		from calendar_selections s join calendar_bookings b on b.id = s.booking_id
		where s.event_id = ${eventId} and b.status = 'active' and s.service_date >= ${fromDate}`;
	return row.count;
}

export async function countBookingsSince(db, eventId, since) {

	const [row] = await db`select count(*)::int as count from calendar_bookings where event_id = ${eventId} and status = 'active' and created_at >= ${since}`;
	return row.count;
}
