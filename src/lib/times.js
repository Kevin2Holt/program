/*
	Time-of-day helpers. A time is a 24-hour "HH:MM" string (Postgres TIME values
	"HH:MM:SS" are accepted and trimmed). Times are wall-clock times in the
	event's time zone.
*/


export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const NOON_HOUR = 12;
const LAST_HOUR_24 = 23;
const TIME_TEXT_PATTERN = /^(\d{1,2})(?::?(\d{2}))?\s*(a|am|p|pm)?$/i;


export function normalizeTime(value) {

	return typeof value === "string" ? value.slice(0, 5) : "";
}

export function convertTimeToMinutes(hhmm) {

	const [hours, minutes] = normalizeTime(hhmm).split(":").map(Number);
	return hours * MINUTES_PER_HOUR + minutes;
}

export function convertMinutesToTime(totalMinutes) {

	const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
	const minutes = totalMinutes % MINUTES_PER_HOUR;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// "17:30" -> "5:30 pm"
export function formatTime12(hhmm) {

	const totalMinutes = convertTimeToMinutes(hhmm);
	const hours24 = Math.floor(totalMinutes / MINUTES_PER_HOUR);
	const minutes = totalMinutes % MINUTES_PER_HOUR;
	const suffix = hours24 >= NOON_HOUR ? "pm" : "am";
	const hours12 = ((hours24 + NOON_HOUR - 1) % NOON_HOUR) + 1;
	return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

// "5:30 pm – 6:30 pm"
export function formatTimeRange(startHhmm, durationMinutes) {

	const endMinutes = convertTimeToMinutes(startHhmm) + durationMinutes;
	return `${formatTime12(startHhmm)} – ${formatTime12(convertMinutesToTime(endMinutes % MINUTES_PER_DAY))}`;
}

// Accepts "5:30 pm", "5pm", "1730", "17:30", "9". Returns "HH:MM" or "" if unreadable.
export function parseTimeText(text) {

	const match = TIME_TEXT_PATTERN.exec(String(text || "").trim().replace(/\./g, ""));
	if (!match) {
		return "";
	}
	let hours = Number(match[1]);
	const minutes = match[2] === undefined ? 0 : Number(match[2]);
	const meridiem = (match[3] || "").toLowerCase();
	if (minutes >= MINUTES_PER_HOUR) {
		return "";
	}
	if (meridiem) {
		if (hours < 1 || hours > NOON_HOUR) {
			return "";
		}
		hours = (hours % NOON_HOUR) + (meridiem.startsWith("p") ? NOON_HOUR : 0);
	}
	else if (hours > LAST_HOUR_24) {
		return "";
	}
	return convertMinutesToTime(hours * MINUTES_PER_HOUR + minutes);
}

export function listTimesByStep(stepMinutes) {

	const times = [];
	for (let minutes = 0; minutes < MINUTES_PER_DAY; minutes += stepMinutes) {
		times.push(convertMinutesToTime(minutes));
	}
	return times;
}
