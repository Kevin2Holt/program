/*
	npm run db:seed: demo data for development, created through the real
	services (so it passes the same validation as the app).
	Re-running replaces the demo organizer and their events.

	Demo login (development only): see DEMO_EMAIL / DEMO_PASSWORD below.
*/
import crypto from "node:crypto";
import { sql } from "$server/db.js";
import { signUpUser } from "$server/services/authService.js";
import { createEvent } from "$server/services/eventService.js";
import { createBlock, publishProgram, saveHeader } from "$server/services/programService.js";
import { createCalendar, updateCalendarConfig } from "$server/services/calendarConfigService.js";
import { saveCalendarItem } from "$server/services/calendarItemService.js";
import { saveCalendarRule } from "$server/services/calendarRuleService.js";
import { createBooking } from "$server/services/calendarBookingService.js";
import { addDays, getWeekday, todayInTimeZone } from "$lib/dates.js";


const DEMO_EMAIL = "demo@progr.am.test";
const DEMO_PASSWORD = "demo-password-123";
const DEMO_NAME = "Demo Organizer";
const TIME_ZONE = "America/Denver";
const EXIT_FAILURE = 1;
const DAYS_UNTIL_SUMMIT = 7;
const SUMMIT_LENGTH_DAYS = 3;
const MONDAY = 1;
const WEDNESDAY = 3;
const FIRST_WEEK = 1;
const SUNDAY = 0;


/* ---------- Helpers ---------- */

function expectOk(result, what) {

	if (!result.ok) {
		throw new Error(`${what} failed: ${result.message} ${JSON.stringify(result.errors || {})}`);
	}
	return result.value;
}

function buildTextBlock(heading, paragraphs) {

	const content = [];
	let html = "";
	if (heading) {
		content.push({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: heading }] });
		html += `<h2>${heading}</h2>`;
	}
	for (const paragraph of paragraphs) {
		content.push({ type: "paragraph", content: [{ type: "text", text: paragraph }] });
		html += `<p>${paragraph}</p>`;
	}
	return { type: "text", content: { doc: { type: "doc", content } }, html };
}

function buildRows(pairs) {

	return { type: "label_value", content: { rows: pairs.map(([label, value], index) => ({ id: `seed${index}`, label, value })) } };
}

async function addProgram(eventId, header, blocks) {

	expectOk(await saveHeader(eventId, header), "program header");
	for (const block of blocks) {
		expectOk(await createBlock(eventId, block), "program block");
	}
	expectOk(await publishProgram(eventId), "publish program");
}

function findNextWeekday(fromDate, weekday) {

	let date = fromDate;
	while (getWeekday(date) !== weekday) {
		date = addDays(date, 1);
	}
	return date;
}

async function removePreviousDemo() {

	const [user] = await sql`select id from users where lower(email) = lower(${DEMO_EMAIL})`;
	if (user) {
		await sql`delete from events where created_by = ${user.id}`;
		await sql`delete from users where id = ${user.id}`;
	}
}


/* ---------- Demo events ---------- */

async function seedMissionaryMeals(userId, today) {

	const event = expectOk(await createEvent(userId, { name: "Ward Missionary Meals", code: "elm-ward-meals" }), "meals event");
	await addProgram(event.id, { eyebrow: "Elm Ward", title: "Missionary Meals", date: "", time: "Dinner at 5:30 pm", place: "Missionary apartments" }, [
		buildTextBlock("Feed the missionaries", ["Thank you for helping! Pick a day on the signup calendar. The missionaries will text you the day before to confirm."]),
		buildRows([["Dinner time", "5:30 pm"], ["Allergies", "Elder Chen: peanuts"], ["Questions", "Ward mission leader: 801-555-0100"]])
	]);

	expectOk(await createCalendar(event.id, { timeZone: TIME_ZONE }), "meals calendar");
	expectOk(await updateCalendarConfig(event.id, {
		title: "Missionary meals",
		status: "open",
		windowMode: "rolling",
		rollingUnit: "weeks",
		rollingSize: 3,
		formFields: { phone: { on: true, required: true }, contactMethod: { on: true }, numberType: { on: true }, email: { on: true }, notes: { on: true } },
		emailConfirmation: true
	}), "meals setup");

	const names = [["Elders Ramos & Chen", "blue", "circle"], ["Elders Tuilagi & Brooks", "amber", "triangle"], ["Sisters Okafor & Lind", "green", "square"], ["Sisters Park & Moreau", "pink", "diamond"]];
	const items = [];
	for (const [name, color, shape] of names) {
		items.push(expectOk(await saveCalendarItem(event.id, null, { name, capacity: 1, color, shape, times: [] }), name));
	}
	const [ramos, tuilagi, okafor, park] = items;

	const nextMonday = findNextWeekday(addDays(today, DAYS_UNTIL_SUMMIT), MONDAY);
	const rules = [
		{ effect: "block", kind: "recurring", frequency: "weekly", weekdays: [MONDAY], label: "P-day" },
		{ effect: "allow", kind: "recurring", frequency: "weekly", weekdays: [2, 4, 6], appliesTo: "selected", itemIds: [park.id] },
		{ effect: "block", kind: "recurring", frequency: "monthly_weekday", monthWeek: FIRST_WEEK, monthWeekday: SUNDAY, label: "Fast Sunday" },
		{ effect: "allow", kind: "once", onceDate: nextMonday, label: "Transfer week: P-day moved" },
		{ effect: "block", kind: "recurring", frequency: "biweekly", weekdays: [WEDNESDAY], startsOn: today, appliesTo: "selected", itemIds: [tuilagi.id], label: "District council", active: false }
	];
	for (const rule of rules) {
		expectOk(await saveCalendarRule(event.id, null, rule), `rule ${rule.label || rule.frequency}`);
	}

	const people = [
		["Maya Castillo", "801-555-0148", "text", "cell", "", [[ramos, 2]]],
		["The Nguyen family", "385-555-0102", "call", "cell", "We'll bring dinner around 5:30.", [[ramos, 3], [park, 3]]],
		["Sione Fifita", "+676 555 0190", "text", "whatsapp", "Bringing lu pulu", [[tuilagi, 4]]],
		["Grace Whitfield", "801-555-0165", "text", "cell", "", [[okafor, 5]]]
	];
	for (const [name, phone, contactMethod, numberType, notes, picks] of people) {
		const selections = [];
		for (const [item, offset] of picks) {
			let date = addDays(today, offset);
			while (getWeekday(date) === MONDAY || (item === park && ![2, 4, 6].includes(getWeekday(date)))) {
				date = addDays(date, 1);
			}
			selections.push({ itemId: item.id, date, timeId: null });
		}
		const result = await createBooking(event, { name, phone, contactMethod, numberType, email: "", notes, selections, idempotencyKey: crypto.randomUUID() });
		if (!result.ok) {
			console.warn(`  skipped a demo booking for ${name}: ${result.message}`);
		}
	}
	return event;
}

async function seedBreakoutSessions(userId, today) {

	const event = expectOk(await createEvent(userId, { name: "Fall Leadership Summit", code: "leadership-summit" }), "summit event");
	const firstDay = addDays(today, DAYS_UNTIL_SUMMIT);
	const lastDay = addDays(firstDay, SUMMIT_LENGTH_DAYS - 1);
	await addProgram(event.id, { eyebrow: "Breakout sessions", title: "Fall Leadership Summit", date: `${firstDay} – ${lastDay}`, time: "8:30 am – 4:30 pm", place: "Stake Center" }, [
		buildRows([["8:30 am", "Registration and breakfast"], ["9:00 am", "Morning breakouts"], ["12:00 pm", "Lunch"], ["1:00 pm", "Keynote Q&A"], ["2:00 pm", "Afternoon breakouts"]]),
		{ type: "separator", content: { variant: "line" } },
		buildTextBlock("Choose your breakouts", ["Sign up for sessions on the calendar. Some sessions overlap, so you can't pick both."])
	]);

	expectOk(await createCalendar(event.id, { timeZone: TIME_ZONE }), "summit calendar");
	expectOk(await updateCalendarConfig(event.id, {
		title: "Breakouts",
		status: "open",
		windowMode: "fixed",
		fixedStart: firstDay,
		fixedEnd: lastDay,
		timed: true,
		preventOverlap: true,
		icsMode: "separate",
		formFields: { phone: { on: false }, email: { on: true, required: true }, notes: { on: false } }
	}), "summit setup");

	const sessions = [
		{ name: "Leading Volunteers", color: "blue", shape: "circle", capacity: 30, times: [{ startTime: "09:00", durationMinutes: 60 }, { startTime: "14:00", durationMinutes: 60 }] },
		{ name: "Design Thinking Lab", color: "pink", shape: "star", capacity: 20, times: [{ startTime: "09:30", durationMinutes: 90, label: "Room 204" }] },
		{ name: "Budget Basics", color: "teal", shape: "square", capacity: 25, times: [{ startTime: "11:00", durationMinutes: 60 }, { startTime: "15:30", durationMinutes: 60 }] },
		{ name: "Keynote Q&A", color: "amber", shape: "hexagon", capacity: 200, times: [{ startTime: "13:00", durationMinutes: 45, onlyDate: firstDay }] },
		{ name: "Service Project", color: "violet", shape: "glyph", glyph: "S", capacity: 40, times: [] }
	];
	const items = [];
	for (const session of sessions) {
		items.push(expectOk(await saveCalendarItem(event.id, null, session), session.name));
	}
	const [times] = await sql`select array_agg(id order by start_time) as ids from calendar_item_times where item_id = ${items[0].id}`;
	await createBooking(event, { name: "Pat Rivera", email: "pat@example.test", selections: [{ itemId: items[0].id, date: firstDay, timeId: times.ids[0] }], idempotencyKey: crypto.randomUUID() });
	return event;
}

async function seedSacramentProgram(userId) {

	const event = expectOk(await createEvent(userId, { name: "Elm Ward Sacrament Meeting", code: "elm-ward" }), "program event");
	await addProgram(event.id, { eyebrow: "Sacrament Meeting", title: "Elm Ward", date: "Sunday", time: "10:00 am", place: "Elm Chapel" }, [
		buildRows([["Presiding", "Bishop Daniel Arroyo"], ["Conducting", "Brother Marcus Lee"], ["Organist", "Sister Ana Kealoha"], ["Chorister", "Sister Grace Whitfield"]]),
		{ type: "separator", content: { variant: "line" } },
		buildRows([["Opening Hymn", "#2 The Spirit of God"], ["Invocation", "Sister Priya Natarajan"], ["Sacrament Hymn", "#169 As Now We Take the Sacrament"]]),
		buildTextBlock("Speakers", ["This week our youth speakers share what they learned at youth conference, followed by a musical number from the Primary children."]),
		buildRows([["Youth Speaker", "Eli Thompson"], ["Musical Number", "Primary Children"], ["Concluding Speaker", "Sister Ruth Adeyemi"], ["Closing Hymn", "#85 How Firm a Foundation"], ["Benediction", "Brother Sam Oduya"]])
	]);
	return event;
}


/* ---------- Run ---------- */

try {
	const today = todayInTimeZone(TIME_ZONE);
	await removePreviousDemo();
	const user = expectOk(await signUpUser({ displayName: DEMO_NAME, email: DEMO_EMAIL, password: DEMO_PASSWORD }), "demo user");
	const events = [await seedMissionaryMeals(user.id, today), await seedBreakoutSessions(user.id, today), await seedSacramentProgram(user.id)];
	console.log(`Seeded ${events.length} events for ${DEMO_EMAIL} (password: ${DEMO_PASSWORD}):`);
	for (const event of events) {
		console.log(`  /${event.code}  ·  organizer: /events/${event.id}/program`);
	}
}
catch (err) {
	console.error(err.message);
	process.exitCode = EXIT_FAILURE;
}
finally {
	await sql.end();
}
