/*
	Public calendar mockup. One state object drives the grid markers, the day
	panel, and the "Your selections" summary through a single render(), so an
	Item picked in the panel disappears from both the panel and the day cell, and
	removing it restores both. Availability here is canned demo data; the real
	app gets it from the server's availability service.
*/


const MAX_MARKERS_DESKTOP = 8;
const MAX_MARKERS_PHONE = 5;
const PHONE_MAX_WIDTH_PX = 640;
const MINUTES_PER_HOUR = 60;
const DAYS_PER_WEEK = 7;

const DEMO_TODAY = "2026-09-28";

const DEMO_EVENTS = {
	meals: {
		title: "Missionary meals",
		subtitle: "Sign up to feed the missionaries. Pick one or more days, then add your details.",
		timed: false,
		gridStart: "2026-09-27",
		gridWeeks: 4,
		windowStart: "2026-09-28",
		windowEnd: "2026-10-24",
		items: [
			{ id: 1, name: "Elders Ramos & Chen", color: "blue", shape: "circle" },
			{ id: 2, name: "Elders Tuilagi & Brooks", color: "amber", shape: "triangle" },
			{ id: 3, name: "Sisters Okafor & Lind", color: "green", shape: "square" },
			{ id: 4, name: "Sisters Park & Moreau", color: "pink", shape: "diamond" }
		],
		// Canned result of the availability service for the demo window.
		isAvailable(item, date, weekday) {
			const booked = ["1:2026-09-29", "2:2026-09-29", "3:2026-10-01", "1:2026-10-02", "4:2026-10-03", "2:2026-10-06", "3:2026-10-08", "1:2026-10-13"];
			// Mirrors the rules on the Availability mockup: Block Mondays, one-time Allow
			// Oct 12, Block first Sundays, one-time Block Oct 10, Allow Tue/Thu/Sat for item 4.
			const openedOneTime = date === "2026-10-12";
			if ((weekday === 1 && !openedOneTime) || date === "2026-10-10" || date === "2026-10-04") {
				return false;
			}
			if (item.id === 4 && ![2, 4, 6].includes(weekday) && !openedOneTime) {
				return false;
			}
			return !booked.includes(`${item.id}:${date}`);
		}
	},
	sessions: {
		title: "Fall Leadership Summit — Breakouts",
		subtitle: "Choose your sessions. Times are in Mountain Time (America/Denver).",
		timed: true,
		gridStart: "2026-10-11",
		gridWeeks: 1,
		windowStart: "2026-10-15",
		windowEnd: "2026-10-17",
		items: [
			{ id: 1, name: "Leading Volunteers", color: "blue", shape: "circle", slots: [["09:00", 60], ["14:00", 60]] },
			{ id: 2, name: "Design Thinking Lab", color: "pink", shape: "star", slots: [["09:30", 90]] },
			{ id: 3, name: "Budget Basics", color: "teal", shape: "square", slots: [["11:00", 60], ["15:30", 60]] },
			{ id: 4, name: "Keynote Q&A", color: "amber", shape: "hexagon", slots: [["13:00", 45]] },
			{ id: 5, name: "Service Project", color: "violet", shape: "glyph", glyph: "S", slots: [["10:30", 120]] }
		],
		isAvailable(item, date, weekday, slotIndex) {
			if (item.id === 5 && date !== "2026-10-17") {
				return false;
			}
			if (item.id === 3 && date === "2026-10-15" && slotIndex === 0) {
				return false;
			}
			return true;
		}
	}
};


/* ---------- Reusable date helpers (calendar dates as YYYY-MM-DD strings) ---------- */

function parseIsoDate(isoDate) {

	const [year, month, day] = isoDate.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day));
}

function formatIsoDate(date) {

	return date.toISOString().slice(0, 10);
}

function addDaysToIsoDate(isoDate, days) {

	const date = parseIsoDate(isoDate);
	date.setUTCDate(date.getUTCDate() + days);
	return formatIsoDate(date);
}

function formatDateLong(isoDate) {

	return parseIsoDate(isoDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

function formatDateShort(isoDate) {

	return parseIsoDate(isoDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function convertTimeToMinutes(hhmm) {

	const [hours, minutes] = hhmm.split(":").map(Number);
	return hours * MINUTES_PER_HOUR + minutes;
}

function formatMinutesAsTime(totalMinutes) {

	const hours24 = Math.floor(totalMinutes / MINUTES_PER_HOUR);
	const minutes = totalMinutes % MINUTES_PER_HOUR;
	const suffix = hours24 >= 12 ? "pm" : "am";
	const hours12 = ((hours24 + 11) % 12) + 1;
	return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function checkRangesOverlap(aStart, aEnd, bStart, bEnd) {

	// Touching ranges (one ends exactly when the other starts) do not overlap.
	return aStart < bEnd && bStart < aEnd;
}


/* ---------- Program-specific: availability + state ---------- */

const demoKey = new URLSearchParams(location.search).get("mode") === "timed" ? "sessions" : "meals";
const demo = DEMO_EVENTS[demoKey];

const state = {
	selectedDate: null,
	picks: [],
	hiddenItemIds: new Set(),
	picksSheetOpen: false
};

function buildOfferingsForDate(date) {

	const weekday = parseIsoDate(date).getUTCDay();
	const offerings = [];
	demo.items.forEach((item) => {
		if (!demo.timed) {
			if (demo.isAvailable(item, date, weekday)) {
				offerings.push({ key: `${item.id}:${date}`, item, date });
			}
			return;
		}
		item.slots.forEach(([start, duration], slotIndex) => {
			if (demo.isAvailable(item, date, weekday, slotIndex)) {
				const startMin = convertTimeToMinutes(start);
				offerings.push({ key: `${item.id}:${date}:${slotIndex}`, item, date, startMin, endMin: startMin + duration });
			}
		});
	});
	return offerings.sort((a, b) => (a.startMin || 0) - (b.startMin || 0));
}

function checkDateInWindow(date) {

	return date >= demo.windowStart && date <= demo.windowEnd && date >= DEMO_TODAY;
}

function findPickConflict(offering) {

	if (!demo.timed) {
		return null;
	}
	return state.picks.find((pick) => pick.date === offering.date
		&& checkRangesOverlap(pick.startMin, pick.endMin, offering.startMin, offering.endMin)) || null;
}

function buildRemainingOfferings(date) {

	const pickedKeys = new Set(state.picks.map((pick) => pick.key));
	return buildOfferingsForDate(date).filter((offering) => !pickedKeys.has(offering.key));
}

function addPick(offering) {

	if (findPickConflict(offering)) {
		return;
	}
	state.picks = [...state.picks, offering].sort((a, b) => a.date.localeCompare(b.date) || (a.startMin || 0) - (b.startMin || 0));
	render();
	window.mock?.showToast(`Added ${offering.item.name}`, { icon: "check" });
}

function removePick(key) {

	state.picks = state.picks.filter((pick) => pick.key !== key);
	render();
}


/* ---------- Rendering ---------- */

function buildMarker(item, sizeClass) {

	return `<span class="marker ${sizeClass || ""}" data-color="${item.color}" data-shape="${item.shape}" aria-hidden="true">${item.shape === "glyph" ? item.glyph : ""}</span>`;
}

function renderLegend() {

	const legend = document.querySelector("[data-legend]");
	legend.innerHTML = demo.items.map((item) => `
		<button class="legend-chip" type="button" aria-pressed="${!state.hiddenItemIds.has(item.id)}" data-filter="${item.id}">
			${buildMarker(item)}${item.name}
		</button>`).join("");
}

function renderGrid() {

	const grid = document.querySelector("[data-grid]");
	const isPhone = window.innerWidth <= PHONE_MAX_WIDTH_PX;
	const markerCap = isPhone ? MAX_MARKERS_PHONE : MAX_MARKERS_DESKTOP;
	let html = '<div class="cal-dow" aria-hidden="true">' + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<span>${d}</span>`).join("") + "</div>";

	for (let week = 0; week < demo.gridWeeks; week += 1) {
		html += '<div class="cal-week" role="row">';
		for (let dayIndex = 0; dayIndex < DAYS_PER_WEEK; dayIndex += 1) {
			const date = addDaysToIsoDate(demo.gridStart, week * DAYS_PER_WEEK + dayIndex);
			const dayNum = parseIsoDate(date).getUTCDate();
			const monthName = parseIsoDate(date).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
			const label = dayNum === 1 ? `<span class="cal-day__mon">${monthName} </span>${dayNum}` : dayNum;
			const inWindow = checkDateInWindow(date);
			const visible = inWindow ? buildRemainingOfferings(date).filter((o) => !state.hiddenItemIds.has(o.item.id)) : [];
			const pickCount = state.picks.filter((pick) => pick.date === date).length;
			const clickable = inWindow && (visible.length > 0 || pickCount > 0);
			const classes = ["cal-day"];
			if (date === DEMO_TODAY) classes.push("is-today");
			if (!inWindow) classes.push("is-disabled");
			if (inWindow && !clickable) classes.push("is-empty-day");
			if (date === state.selectedDate) classes.push("is-selected");

			const shown = visible.slice(0, visible.length > markerCap ? markerCap - 1 : markerCap);
			const overflow = visible.length - shown.length;
			const markers = shown.map((o) => buildMarker(o.item, "marker--sm")).join("")
				+ (overflow > 0 ? `<span class="cal-day__more">+${overflow}</span>` : "");
			const aria = `${formatDateLong(date)}${inWindow ? `, ${visible.length} available` : ", unavailable"}${pickCount ? `, ${pickCount} selected` : ""}`;
			const tag = clickable ? "button" : "div";

			html += `<${tag} class="${classes.join(" ")}" role="gridcell" ${clickable ? `type="button" data-date="${date}"` : 'aria-disabled="true"'} aria-label="${aria}"${date === state.selectedDate ? ' aria-selected="true"' : ""}>
				<span class="cal-day__num">${label}</span>
				${pickCount ? `<span class="cal-day__picked" aria-hidden="true">${pickCount}</span>` : ""}
				<span class="cal-day__markers">${markers}</span>
			</${tag}>`;
		}
		html += "</div>";
	}
	grid.innerHTML = html;
}

function renderPanel() {

	const panel = document.querySelector("[data-panel]");
	if (!state.selectedDate) {
		panel.hidden = window.innerWidth <= PHONE_MAX_WIDTH_PX;
		panel.innerHTML = `
			<div class="day-panel__empty">
				${window.mock.buildIcon("calendar")}
				<p style="margin-top:var(--space-2)">Pick a day on the calendar to see what's open.</p>
			</div>`;
		return;
	}

	panel.hidden = false;
	const offerings = buildRemainingOfferings(state.selectedDate);
	const rows = offerings.map((offering) => {
		const conflict = findPickConflict(offering);
		const time = demo.timed ? `<div class="slot__time">${formatMinutesAsTime(offering.startMin)} – ${formatMinutesAsTime(offering.endMin)}${conflict ? ` · overlaps ${formatMinutesAsTime(conflict.startMin)} pick` : ""}</div>` : "";
		return `<li>
			<button class="slot${conflict ? " is-conflict" : ""}" type="button" data-add="${offering.key}"${conflict ? ' aria-disabled="true"' : ""}>
				${buildMarker(offering.item, "marker--lg")}
				<span class="slot__main"><span class="slot__name">${offering.item.name}</span>${time}</span>
				<span class="slot__add" aria-hidden="true">${window.mock.buildIcon(conflict ? "ban" : "plus")}</span>
				<span class="sr-only">${conflict ? "Unavailable: overlaps a selected time" : "Add"}</span>
			</button>
		</li>`;
	}).join("");

	const picked = state.picks.filter((pick) => pick.date === state.selectedDate).length;
	panel.innerHTML = `
		<div class="day-panel__head">
			<div>
				<div class="day-panel__date">${formatDateLong(state.selectedDate)}</div>
				<div class="day-panel__sub">${offerings.length ? `${offerings.length} open` : "Nothing else open"}${picked ? ` · ${picked} in your selections` : ""}</div>
			</div>
			<button class="btn btn--ghost btn--icon" type="button" data-close-panel aria-label="Close day">${window.mock.buildIcon("x")}</button>
		</div>
		${offerings.length ? `<ul class="day-panel__list">${rows}</ul>` : `<div class="day-panel__empty">You've picked everything open on this day.</div>`}`;
}

function renderPicks() {

	const picks = document.querySelector("[data-picks]");
	const bar = document.querySelector("[data-pick-bar]");
	const count = state.picks.length;

	const list = state.picks.map((pick) => `
		<li class="pick">
			${buildMarker(pick.item, "marker--lg")}
			<div class="pick__main">
				<div class="pick__name">${pick.item.name}</div>
				<div class="pick__when">${formatDateShort(pick.date)}${demo.timed ? ` · ${formatMinutesAsTime(pick.startMin)} – ${formatMinutesAsTime(pick.endMin)}` : ""}</div>
			</div>
			<button class="btn btn--ghost btn--icon btn--sm" type="button" data-remove="${pick.key}" aria-label="Remove ${pick.item.name} on ${formatDateShort(pick.date)}">${window.mock.buildIcon("x")}</button>
		</li>`).join("");

	picks.classList.toggle("is-open", state.picksSheetOpen && count > 0);
	picks.innerHTML = `
		<div class="picks__head">
			<span class="picks__title">Your selections</span>
			<span class="badge${count ? " badge--accent" : ""}">${count}</span>
		</div>
		${count ? `<ul class="picks__list">${list}</ul>` : '<div class="picks__empty">Nothing selected yet. Items you add will appear here.</div>'}
		<div class="picks__foot">
			<a class="btn btn--primary btn--lg btn--block${count ? "" : " is-disabled"}" href="signup.html${demoKey === "sessions" ? "?mode=timed" : ""}"${count ? "" : ' aria-disabled="true"'}>Continue ${window.mock.buildIcon("arrow-right")}</a>
		</div>`;

	bar.hidden = count === 0 || (window.innerWidth > PHONE_MAX_WIDTH_PX);
	bar.innerHTML = `
		<button class="pick-bar__count grow" type="button" data-toggle-picks aria-expanded="${state.picksSheetOpen}">
			<span class="pick-bar__markers">${state.picks.slice(0, 4).map((p) => buildMarker(p.item, "marker--sm")).join("")}</span>
			${count} selected ${window.mock.buildIcon(state.picksSheetOpen ? "chev-down" : "chev-up", "subtle")}
		</button>
		<a class="btn btn--primary" href="signup.html${demoKey === "sessions" ? "?mode=timed" : ""}">Continue</a>`;
}

function render() {

	renderLegend();
	renderGrid();
	renderPanel();
	renderPicks();
}


/* ---------- Wiring ---------- */

function wireCalendar() {

	document.querySelector("[data-title]").textContent = demo.title;
	document.querySelector("[data-subtitle]").textContent = demo.subtitle;

	document.addEventListener("click", (event) => {
		const day = event.target.closest("[data-date]");
		if (day) {
			state.selectedDate = day.dataset.date === state.selectedDate ? null : day.dataset.date;
			state.picksSheetOpen = false;
			render();
			return;
		}
		const add = event.target.closest("[data-add]");
		if (add && add.getAttribute("aria-disabled") !== "true") {
			const offering = buildRemainingOfferings(state.selectedDate).find((o) => o.key === add.dataset.add);
			addPick(offering);
			return;
		}
		const remove = event.target.closest("[data-remove]");
		if (remove) {
			removePick(remove.dataset.remove);
			return;
		}
		const filter = event.target.closest("[data-filter]");
		if (filter) {
			const id = Number(filter.dataset.filter);
			if (state.hiddenItemIds.has(id)) {
				state.hiddenItemIds.delete(id);
			}
			else {
				state.hiddenItemIds.add(id);
			}
			render();
			return;
		}
		if (event.target.closest("[data-close-panel]")) {
			state.selectedDate = null;
			render();
			return;
		}
		if (event.target.closest("[data-toggle-picks]")) {
			state.picksSheetOpen = !state.picksSheetOpen;
			if (state.picksSheetOpen) {
				state.selectedDate = null;
			}
			render();
		}
	});

	// Arrow keys move between day cells (roving focus across the grid).
	document.querySelector("[data-grid]").addEventListener("keydown", (event) => {
		const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -DAYS_PER_WEEK, ArrowDown: DAYS_PER_WEEK };
		if (!(event.key in steps)) {
			return;
		}
		const cells = [...document.querySelectorAll(".cal-day")];
		let index = cells.indexOf(event.target.closest(".cal-day"));
		do {
			index += steps[event.key];
		} while (index >= 0 && index < cells.length && cells[index].tagName !== "BUTTON");
		if (cells[index]) {
			event.preventDefault();
			cells[index].focus();
		}
	});

	window.addEventListener("resize", render);

	const preset = new URLSearchParams(location.search).get("demo");
	if (preset === "selected") {
		const first = demoKey === "sessions" ? "2026-10-15" : "2026-10-01";
		const offerings = buildOfferingsForDate(first);
		state.picks = demoKey === "sessions" ? [offerings[0], offerings[2]] : [offerings[0], buildOfferingsForDate("2026-10-07")[1]];
		state.selectedDate = first;
	}
	render();
}

document.addEventListener("mock:ready", wireCalendar);
