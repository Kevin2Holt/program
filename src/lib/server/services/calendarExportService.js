/*
	CSV export. Privacy is enforced here, not in the UI: each detail level has a
	fixed column set, and contact fields appear only at the "contact" level and
	only when chosen. Values that a spreadsheet would run as formulas are
	neutralized (reference key: OWASP CSV injection).

	Detail levels:
	  count          one row per offering: date, time, item, signups
	  names          one row per signup: date, time, item, name
	  count_names    one row per offering: date, time, item, signups, names
	  contact        one row per signup: date, time, item, name + chosen fields
*/
import { failInvalid, succeed } from "$lib/result.js";
import { addDays, checkIsoDate, todayInTimeZone } from "$lib/dates.js";
import { formatTime12, normalizeTime, parseTimeText } from "$lib/times.js";
import { sql } from "../db.js";
import { listExportRows } from "../data/bookings.js";
import { findConfig } from "../data/calendar.js";


export const DETAIL_LEVELS = ["count", "names", "count_names", "contact"];
export const CONTACT_FIELDS = ["phone", "contactMethod", "numberType", "email", "notes"];
const CONTACT_FIELD_HEADERS = { phone: "Phone", contactMethod: "Contact", numberType: "Number type", email: "Email", notes: "Notes" };
const CONTACT_FIELD_COLUMNS = { phone: "phone", contactMethod: "contact_method", numberType: "number_type", email: "email", notes: "notes" };
const DISPLAY_VALUES = { call: "Call", text: "Text", cell: "Cell", whatsapp: "WhatsApp" };
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const CSV_NEEDS_QUOTES = /[",\r\n]/;
const PREVIEW_ROWS = 5;
const RANGES = ["upcoming", "past", "all", "custom"];
const CRLF = "\r\n";
const UTF8_BOM = "﻿";


export function escapeCsvCell(value) {

	let text = value === null || value === undefined ? "" : String(value);
	if (FORMULA_TRIGGER.test(text)) {
		text = `'${text}`;
	}
	return CSV_NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

export function buildCsv(header, rows) {

	return UTF8_BOM + [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join(CRLF) + CRLF;
}

function normalizeOptions(raw, today) {

	const options = {
		detail: DETAIL_LEVELS.includes(raw.detail) ? raw.detail : "contact",
		fields: (Array.isArray(raw.fields) ? raw.fields : []).filter((field) => CONTACT_FIELDS.includes(field)),
		itemIds: (Array.isArray(raw.itemIds) ? raw.itemIds : []).map(Number).filter(Number.isInteger),
		range: RANGES.includes(raw.range) ? raw.range : "upcoming",
		fromTime: raw.fromTime ? parseTimeText(raw.fromTime) : "",
		toTime: raw.toTime ? parseTimeText(raw.toTime) : "",
		includeCanceled: false
	};
	const errors = {};
	let fromDate = null;
	let toDate = null;
	if (options.range === "upcoming") {
		fromDate = today;
	}
	else if (options.range === "past") {
		toDate = addDays(today, -1);
	}
	else if (options.range === "custom") {
		fromDate = raw.fromDate || null;
		toDate = raw.toDate || null;
		if ((fromDate && !checkIsoDate(fromDate)) || (toDate && !checkIsoDate(toDate))) {
			errors.range = "Choose valid dates.";
		}
		else if (fromDate && toDate && toDate < fromDate) {
			errors.range = "The end date must be on or after the start date.";
		}
	}
	if ((raw.fromTime && !options.fromTime) || (raw.toTime && !options.toTime)) {
		errors.time = "Enter times like 9:00 am.";
	}
	return { options: { ...options, fromDate, toDate }, errors };
}

function formatTimeCell(row) {

	return row.start_time ? formatTime12(normalizeTime(row.start_time)) : "";
}

function groupByOffering(rows) {

	const groups = new Map();
	for (const row of rows) {
		const key = `${row.service_date}|${row.time_id || ""}|${row.item_id}`;
		if (!groups.has(key)) {
			groups.set(key, { first: row, names: [] });
		}
		groups.get(key).names.push(row.name);
	}
	return [...groups.values()];
}

function shapeRows(rows, options) {

	switch (options.detail) {
		case "count":
			return {
				header: ["Date", "Time", "Item", "Signups"],
				rows: groupByOffering(rows).map(({ first, names }) => [first.service_date, formatTimeCell(first), first.item_name, names.length])
			};
		case "count_names":
			return {
				header: ["Date", "Time", "Item", "Signups", "Names"],
				rows: groupByOffering(rows).map(({ first, names }) => [first.service_date, formatTimeCell(first), first.item_name, names.length, names.join("; ")])
			};
		case "names":
			return {
				header: ["Date", "Time", "Item", "Name"],
				rows: rows.map((row) => [row.service_date, formatTimeCell(row), row.item_name, row.name])
			};
		default:
			return {
				header: ["Date", "Time", "Item", "Name", ...options.fields.map((field) => CONTACT_FIELD_HEADERS[field])],
				rows: rows.map((row) => [
					row.service_date,
					formatTimeCell(row),
					row.item_name,
					row.name,
					...options.fields.map((field) => DISPLAY_VALUES[row[CONTACT_FIELD_COLUMNS[field]]] || row[CONTACT_FIELD_COLUMNS[field]] || "")
				])
			};
	}
}

/*
	Returns { header, rows, rowCount } (preview: first rows only) or field errors.
	Only the columns for the chosen detail level ever leave this function.
*/
export async function buildExport(eventId, rawOptions, { preview = false } = {}) {

	const config = await findConfig(sql, eventId);
	const { options, errors } = normalizeOptions(rawOptions || {}, todayInTimeZone(config?.timeZone || "UTC"));
	if (Object.keys(errors).length) {
		return failInvalid(errors);
	}
	const source = await listExportRows(sql, eventId, { ...options, fromTime: options.fromTime || null, toTime: options.toTime || null });
	const shaped = shapeRows(source, options);
	return succeed({
		header: shaped.header,
		rows: preview ? shaped.rows.slice(0, PREVIEW_ROWS) : shaped.rows,
		rowCount: shaped.rows.length,
		csv: preview ? null : buildCsv(shaped.header, shaped.rows)
	});
}
