/*
	Calendar files (RFC 5545) for the confirmation page. Timed selections are
	converted from the event's time zone to UTC, so every calendar app shows the
	right moment; date-only selections are all-day events.
	Modes: "combined" = one event covering every selection;
	"per_day" = one event per date (the default for new calendars);
	"separate" = one event per selection.
*/
import { DateTime } from "luxon";
import { addDays } from "$lib/dates.js";
import { formatTime12 } from "$lib/times.js";


const MAX_LINE_OCTETS = 75;
const CRLF = "\r\n";
const PRODUCT_ID = "-//progr.am//Signup Calendar//EN";


export function escapeIcsText(value) {

	return String(value ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Folds a content line to 75 octets per RFC 5545 §3.1 without splitting UTF-8 characters.
export function foldIcsLine(line) {

	const encoder = new TextEncoder();
	const parts = [];
	let current = "";
	let currentOctets = 0;
	for (const character of line) {
		const octets = encoder.encode(character).length;
		const limit = parts.length ? MAX_LINE_OCTETS - 1 : MAX_LINE_OCTETS;
		if (currentOctets + octets > limit) {
			parts.push(current);
			current = "";
			currentOctets = 0;
		}
		current += character;
		currentOctets += octets;
	}
	parts.push(current);
	return parts.join(`${CRLF} `);
}

function formatUtcStamp(dateTime) {

	return dateTime.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
}

function formatDateValue(isoDate) {

	return isoDate.replace(/-/g, "");
}

function toZonedStart(selection, timeZone) {

	return DateTime.fromISO(`${selection.date}T${selection.startTime}`, { zone: timeZone });
}

function describeSelection(selection) {

	return selection.startTime ? `${selection.itemName}, ${selection.date} ${formatTime12(selection.startTime)}` : `${selection.itemName}, ${selection.date}`;
}

function buildEventLines({ uid, stamp, summary, description, url, start, end, allDay }) {

	return [
		"BEGIN:VEVENT",
		`UID:${uid}`,
		`DTSTAMP:${stamp}`,
		allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`,
		allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`,
		`SUMMARY:${escapeIcsText(summary)}`,
		`DESCRIPTION:${escapeIcsText(description)}`,
		`URL:${url}`,
		"END:VEVENT"
	];
}

function buildSelectionSpan(selection, timeZone) {

	if (!selection.startTime) {
		return { allDay: true, start: formatDateValue(selection.date), end: formatDateValue(addDays(selection.date, 1)) };
	}
	const start = toZonedStart(selection, timeZone);
	return { allDay: false, start: formatUtcStamp(start), end: formatUtcStamp(start.plus({ minutes: selection.durationMinutes })) };
}

// One event covering a group of sorted selections: all-day if any is date-only, else earliest start to latest end.
function buildGroupSpan(group, timeZone) {

	if (group.some((selection) => !selection.startTime)) {
		return { allDay: true, start: formatDateValue(group[0].date), end: formatDateValue(addDays(group.at(-1).date, 1)) };
	}
	const spans = group.map((selection) => buildSelectionSpan(selection, timeZone));
	return { allDay: false, start: spans.map((entry) => entry.start).sort()[0], end: spans.map((entry) => entry.end).sort().at(-1) };
}

function groupSelectionsByDate(sorted) {

	const groups = [];
	for (const selection of sorted) {
		if (groups.at(-1)?.[0].date === selection.date) {
			groups.at(-1).push(selection);
		}
		else {
			groups.push([selection]);
		}
	}
	return groups;
}

/*
	selections: [{ itemName, date, startTime|null, durationMinutes|null }]
	Returns the full .ics text.
*/
export function buildIcs({ eventName, calendarTitle, timeZone, reference, confirmationUrl, selections, mode, now = new Date() }) {

	const stamp = formatUtcStamp(DateTime.fromJSDate(now));
	const sorted = [...selections].sort((a, b) => (a.date + (a.startTime || "")).localeCompare(b.date + (b.startTime || "")));
	const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${PRODUCT_ID}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];

	if (mode === "separate") {
		sorted.forEach((selection, index) => {
			lines.push(...buildEventLines({
				uid: `${reference}-${index}@progr.am`,
				stamp,
				summary: `${selection.itemName} · ${eventName}`,
				description: `${calendarTitle}\n${describeSelection(selection)}\n${confirmationUrl}`,
				url: confirmationUrl,
				...buildSelectionSpan(selection, timeZone)
			}));
		});
	}
	else {
		const groups = mode === "per_day" ? groupSelectionsByDate(sorted) : [sorted];
		groups.forEach((group) => {
			lines.push(...buildEventLines({
				uid: groups.length === 1 ? `${reference}@progr.am` : `${reference}-${group[0].date}@progr.am`,
				stamp,
				summary: group.length === 1 ? `${group[0].itemName} · ${eventName}` : `${calendarTitle} · ${eventName}`,
				description: `${group.map(describeSelection).join("\n")}\n${confirmationUrl}`,
				url: confirmationUrl,
				...buildGroupSpan(group, timeZone)
			}));
		});
	}

	lines.push("END:VCALENDAR");
	return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
