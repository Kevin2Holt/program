/*
	Mockup runtime: icon sprite, theme switching, organizer shell, and the
	behaviour of the custom controls (select, combobox, date picker, segmented,
	switch reveals, dialogs, menus, toasts). The real app implements the same
	behaviour as Svelte components; this file only makes the mockups clickable.
*/


const THEME_STORAGE_KEY = "progr-theme";
const TOAST_LIFETIME_MS = 3200;
const TOAST_LEAVE_MS = 200;

const ICON_PATHS = {
	check: '<path d="M20 6 9 17l-5-5"/>',
	x: '<path d="M18 6 6 18M6 6l12 12"/>',
	plus: '<path d="M12 5v14M5 12h14"/>',
	minus: '<path d="M5 12h14"/>',
	"chev-down": '<path d="m6 9 6 6 6-6"/>',
	"chev-up": '<path d="m18 15-6-6-6 6"/>',
	"chev-right": '<path d="m9 18 6-6-6-6"/>',
	"chev-left": '<path d="m15 18-6-6 6-6"/>',
	"chev-updown": '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
	search: '<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/>',
	sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
	moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
	menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
	more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
	grip: '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
	trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
	copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
	pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
	eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
	external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
	link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
	calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
	"calendar-plus": '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v5M9.5 16.5h5"/>',
	clock: '<circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/>',
	pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
	users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
	sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
	list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
	filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
	download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
	file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
	layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
	grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
	type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
	rows: '<path d="M3 6h6M13 6h8M3 12h6M13 12h8M3 18h6M13 18h8"/>',
	separator: '<path d="M3 12h18M8 6h8M8 18h8" opacity=".9"/>',
	"shield-check": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
	ban: '<circle cx="12" cy="12" r="9.5"/><path d="m5.3 5.3 13.4 13.4"/>',
	repeat: '<path d="m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"/>',
	message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
	"message-circle": '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
	phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
	mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
	"alert-circle": '<circle cx="12" cy="12" r="9.5"/><path d="M12 8v4M12 16h.01"/>',
	"alert-triangle": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
	info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 16v-4M12 8h.01"/>',
	loader: '<path d="M21 12a9 9 0 1 1-6.22-8.56"/>',
	undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
	send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
	globe: '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5a15.3 15.3 0 0 1 4 9.5 15.3 15.3 0 0 1-4 9.5 15.3 15.3 0 0 1-4-9.5 15.3 15.3 0 0 1 4-9.5z"/>',
	"log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
	user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
	"arrow-left": '<path d="M19 12H5M12 19l-7-7 7-7"/>',
	"arrow-right": '<path d="M5 12h14M12 5l7 7-7 7"/>',
	home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
	archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
	power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
	phoneDevice: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
	monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
	ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
	shapes: '<path d="M8.3 10a.7.7 0 0 1-.63-1.08L11.4 3a.7.7 0 0 1 1.2-.04L16.3 8.9a.7.7 0 0 1-.57 1.1Z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/>',
	lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
	bold: '<path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z"/>',
	italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
	underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4M4 20h16"/>',
	"list-ol": '<path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
	heading: '<path d="M6 12h12M6 20V4M18 20V4"/>',
	cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
	"cloud-check": '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="m9.5 13.5 2 2 3.5-3.5"/>',
	sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
	hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>'
};


/* ---------- Reusable helpers ---------- */

function readStorage(key) {

	try {
		return localStorage.getItem(key);
	}
	catch (err) {
		return null;
	}
}

function writeStorage(key, value) {

	try {
		localStorage.setItem(key, value);
	}
	catch (err) {
		// Storage can be blocked (private mode); theme still switches for this page.
	}
}

function buildIcon(name, extraClass) {

	return `<svg class="icon${extraClass ? " " + extraClass : ""}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function injectIconSprite() {

	const symbols = Object.entries(ICON_PATHS)
		.map(([name, body]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${body}</symbol>`)
		.join("");
	const holder = document.createElement("div");
	holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${symbols}</svg>`;
	document.body.prepend(holder.firstChild);
}

function showToast(message, options = {}) {

	let region = document.querySelector(".toasts");
	if (!region) {
		region = document.createElement("div");
		region.className = "toasts";
		region.setAttribute("role", "status");
		region.setAttribute("aria-live", "polite");
		document.body.append(region);
	}

	const toast = document.createElement("div");
	toast.className = "toast";
	toast.innerHTML = `${buildIcon(options.icon || "check")}<span>${message}</span>`
		+ (options.action ? `<button class="btn btn--sm btn--ghost toast__action">${options.action}</button>` : "");
	region.append(toast);

	setTimeout(() => {
		toast.classList.add("is-leaving");
		setTimeout(() => toast.remove(), TOAST_LEAVE_MS);
	}, TOAST_LIFETIME_MS);
}

function closeAllPopovers(except) {

	document.querySelectorAll(".popover:not([hidden])").forEach((pop) => {
		if (pop === except) {
			return;
		}
		pop.hidden = true;
		const owner = pop.parentElement.querySelector("[aria-expanded]");
		if (owner) {
			owner.setAttribute("aria-expanded", "false");
		}
	});
}


/* ---------- Theme ---------- */

function applyTheme(theme) {

	document.documentElement.dataset.theme = theme;
	writeStorage(THEME_STORAGE_KEY, theme);
	document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
		btn.innerHTML = buildIcon(theme === "dark" ? "sun" : "moon");
		btn.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
	});
}

function wireThemeToggles() {

	applyTheme(document.documentElement.dataset.theme || "dark");
	document.addEventListener("click", (event) => {
		const btn = event.target.closest("[data-theme-toggle]");
		if (btn) {
			applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
		}
	});
}


/* ---------- Organizer shell ---------- */

const ORGANIZER_NAV = [
	{ group: null, links: [
		{ key: "dashboard", label: "All events", icon: "home", href: "dashboard.html" }
	] },
	{ group: "Event", links: [
		{ key: "program", label: "Program", icon: "file", href: "program-editor.html" },
		{ key: "settings", label: "Event settings", icon: "sliders", href: "#" }
	] },
	{ group: "Calendar", links: [
		{ key: "overview", label: "Overview", icon: "grid", href: "calendar-overview.html" },
		{ key: "setup", label: "Setup", icon: "calendar", href: "calendar-setup.html" },
		{ key: "items", label: "Items", icon: "shapes", href: "items.html", count: "4" },
		{ key: "availability", label: "Availability", icon: "shield-check", href: "availability.html", count: "6" },
		{ key: "bookings", label: "Bookings", icon: "ticket", href: "bookings.html", count: "38" },
		{ key: "export", label: "Export", icon: "download", href: "export.html" }
	] }
];

function buildSidebar(activeKey, showEvent) {

	const groups = ORGANIZER_NAV
		.filter((group) => showEvent || group.group === null)
		.map((group) => {
			const links = group.links.map((link) => `
				<a class="nav-link" href="${link.href}"${link.key === activeKey ? ' aria-current="page"' : ""}>
					${buildIcon(link.icon)}<span>${link.label}</span>
					${link.count ? `<span class="nav-link__count">${link.count}</span>` : ""}
				</a>`).join("");
			return `<div class="nav-group">${group.group ? `<div class="nav-group__label caps">${group.group}</div>` : ""}${links}</div>`;
		}).join("");

	const eventSwitch = showEvent ? `
		<button class="event-switch" type="button">
			<span class="grow">
				<span class="event-switch__name">${document.body.dataset.eventName || "Ward Missionary Meals"}</span><br>
				<span class="event-switch__code">progr.am/${document.body.dataset.eventCode || "elm-ward-meals"}</span>
			</span>
			${buildIcon("chev-updown", "subtle")}
		</button>` : "";

	return `
		<aside class="sidebar" aria-label="Organizer navigation">
			<a class="brand" href="index.html"><span class="brand__mark">p</span><span>progr<span class="brand__dot">.</span>am</span></a>
			${eventSwitch}
			${groups}
			<div class="sidebar__foot">
				<a class="nav-link" href="#">${buildIcon("user")}<span>Kevin Holt</span></a>
			</div>
		</aside>`;
}

function buildTopbar(crumbs, actions) {

	const trail = crumbs.map((crumb, index) => index === crumbs.length - 1
		? `<span class="crumbs__current">${crumb}</span>`
		: `<a href="#">${crumb}</a><span class="crumbs__sep">/</span>`).join("");

	return `
		<header class="topbar">
			<button class="btn btn--ghost btn--icon mobile-nav-btn" type="button" data-nav-toggle aria-label="Open navigation">${buildIcon("menu")}</button>
			<nav class="crumbs grow" aria-label="Breadcrumb">${trail}</nav>
			${actions || ""}
			<button class="btn btn--ghost btn--icon" type="button" data-theme-toggle></button>
		</header>`;
}

function mountOrganizerShell() {

	const body = document.body;
	if (body.dataset.shell !== "organizer") {
		return;
	}

	const content = document.querySelector("[data-shell-content]");
	const crumbs = (body.dataset.crumbs || "").split("|").filter(Boolean);
	const actionsTemplate = document.querySelector("template[data-topbar-actions]");
	const actions = actionsTemplate ? actionsTemplate.innerHTML : "";

	const app = document.createElement("div");
	app.className = "app";
	app.innerHTML = buildSidebar(body.dataset.nav, body.dataset.event !== "none")
		+ `<div class="main">${buildTopbar(crumbs, actions)}</div>`;
	app.querySelector(".main").append(content);
	body.prepend(app);

	document.addEventListener("click", (event) => {
		if (event.target.closest("[data-nav-toggle]")) {
			app.classList.toggle("nav-open");
		}
		else if (app.classList.contains("nav-open") && !event.target.closest(".sidebar")) {
			app.classList.remove("nav-open");
		}
	});
}


/* ---------- Custom select + combobox ---------- */

function moveActiveOption(listbox, step) {

	const options = [...listbox.querySelectorAll('[role="option"]:not(.hidden)')];
	if (!options.length) {
		return;
	}
	const current = options.findIndex((opt) => opt.classList.contains("is-active"));
	const next = options[Math.max(0, Math.min(options.length - 1, current + step))];
	options.forEach((opt) => opt.classList.remove("is-active"));
	next.classList.add("is-active");
	next.scrollIntoView({ block: "nearest" });
}

function chooseOption(select, option) {

	const trigger = select.querySelector(".select-trigger");
	const valueEl = trigger.querySelector(".select-trigger__value");
	select.querySelectorAll('[role="option"]').forEach((opt) => opt.setAttribute("aria-selected", String(opt === option)));
	valueEl.textContent = option.dataset.label || option.querySelector(".option__label")?.textContent || option.textContent.trim();
	valueEl.classList.remove("is-placeholder");
	select.dataset.value = option.dataset.value;
	select.dispatchEvent(new CustomEvent("select:change", { bubbles: true, detail: { value: option.dataset.value } }));
	closeAllPopovers();
	trigger.focus();
}

function wireSelects() {

	document.addEventListener("click", (event) => {
		const trigger = event.target.closest(".select-trigger, [data-popover-trigger]");
		if (trigger) {
			const pop = trigger.parentElement.querySelector(".popover");
			const opening = pop.hidden;
			closeAllPopovers(pop);
			pop.hidden = !opening;
			trigger.setAttribute("aria-expanded", String(opening));
			if (opening) {
				const search = pop.querySelector(".combobox__search input");
				const selected = pop.querySelector('[aria-selected="true"]');
				pop.querySelectorAll(".is-active").forEach((opt) => opt.classList.remove("is-active"));
				if (selected) {
					selected.classList.add("is-active");
					selected.scrollIntoView({ block: "nearest" });
				}
				(search || pop.querySelector("button, [role=option]"))?.focus?.();
			}
			return;
		}

		const option = event.target.closest('.select [role="option"]');
		if (option) {
			chooseOption(option.closest(".select"), option);
			return;
		}

		if (!event.target.closest(".popover")) {
			closeAllPopovers();
		}
	});

	document.addEventListener("keydown", (event) => {
		const select = event.target.closest(".select");
		if (event.key === "Escape") {
			closeAllPopovers();
			return;
		}
		if (!select) {
			return;
		}
		const pop = select.querySelector(".popover");
		const listbox = select.querySelector('[role="listbox"]');
		if (!listbox) {
			return;
		}
		if (pop.hidden && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") && event.target.classList.contains("select-trigger")) {
			event.preventDefault();
			event.target.click();
			return;
		}
		if (pop.hidden) {
			return;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			moveActiveOption(listbox, event.key === "ArrowDown" ? 1 : -1);
		}
		else if (event.key === "Enter") {
			event.preventDefault();
			const active = listbox.querySelector(".is-active");
			if (active) {
				chooseOption(select, active);
			}
		}
	});

	document.addEventListener("input", (event) => {
		const search = event.target.closest(".combobox__search input");
		if (!search) {
			return;
		}
		const query = search.value.trim().toLowerCase();
		const listbox = search.closest(".popover").querySelector('[role="listbox"]');
		listbox.querySelectorAll('[role="option"]').forEach((opt) => {
			opt.classList.toggle("hidden", query !== "" && !opt.textContent.toLowerCase().includes(query));
		});
		listbox.querySelectorAll(".is-active").forEach((opt) => opt.classList.remove("is-active"));
		moveActiveOption(listbox, 0);
	});
}


/* ---------- Segmented controls and reveal-by-choice ---------- */

function syncReveals(groupName, value) {

	document.querySelectorAll(`[data-when^="${groupName}:"]`).forEach((panel) => {
		const wanted = panel.dataset.when.split(":")[1].split(",");
		const show = wanted.includes(value);
		if (panel.classList.contains("reveal")) {
			panel.classList.toggle("is-collapsed", !show);
			panel.inert = !show;
		}
		else {
			panel.hidden = !show;
		}
	});
}

function wireSegmented() {

	document.addEventListener("click", (event) => {
		const opt = event.target.closest(".segmented__opt, .choice-card, .swatch, .shape-opt");
		if (!opt) {
			return;
		}
		const group = opt.closest('[role="radiogroup"], [role="tablist"]');
		if (!group) {
			return;
		}
		const attr = group.getAttribute("role") === "tablist" ? "aria-selected" : "aria-checked";
		group.querySelectorAll(`[${attr}]`).forEach((other) => other.setAttribute(attr, String(other === opt)));
		if (group.dataset.group) {
			syncReveals(group.dataset.group, opt.dataset.value);
		}
		group.dispatchEvent(new CustomEvent("segmented:change", { bubbles: true, detail: { value: opt.dataset.value } }));
	});

	document.addEventListener("keydown", (event) => {
		const opt = event.target.closest(".segmented__opt");
		if (!opt || (event.key !== "ArrowRight" && event.key !== "ArrowLeft")) {
			return;
		}
		const options = [...opt.parentElement.querySelectorAll(".segmented__opt")];
		const next = options[(options.indexOf(opt) + (event.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
		next.focus();
		next.click();
	});

	document.querySelectorAll('[role="radiogroup"][data-group]').forEach((group) => {
		const checked = group.querySelector('[aria-checked="true"]');
		if (checked) {
			syncReveals(group.dataset.group, checked.dataset.value);
		}
	});

	document.querySelectorAll("input[data-reveal]").forEach((input) => {
		const sync = () => syncReveals(input.dataset.reveal, input.checked ? "on" : "off");
		input.addEventListener("change", sync);
		sync();
	});

	document.addEventListener("click", (event) => {
		const day = event.target.closest(".weekday");
		if (day) {
			day.setAttribute("aria-pressed", String(day.getAttribute("aria-pressed") !== "true"));
		}
		const disclosure = event.target.closest(".disclosure");
		if (disclosure) {
			const open = disclosure.getAttribute("aria-expanded") !== "true";
			disclosure.setAttribute("aria-expanded", String(open));
			const panel = document.getElementById(disclosure.getAttribute("aria-controls"));
			panel.classList.toggle("is-collapsed", !open);
			panel.inert = !open;
		}
	});
}


/* ---------- Dialogs and drawers ---------- */

let lastFocusBeforeDialog = null;

function openDialog(id) {

	const overlay = document.getElementById(id);
	closeAllPopovers();
	lastFocusBeforeDialog = document.activeElement;
	overlay.hidden = false;
	const focusTarget = overlay.querySelector("[data-autofocus]") || overlay.querySelector("button, input, [tabindex]");
	focusTarget?.focus();
}

function closeDialog(overlay) {

	overlay.hidden = true;
	lastFocusBeforeDialog?.focus?.();
}

function wireDialogs() {

	document.addEventListener("click", (event) => {
		const opener = event.target.closest("[data-open]");
		if (opener) {
			event.preventDefault();
			openDialog(opener.dataset.open);
			return;
		}
		const closer = event.target.closest("[data-close]");
		if (closer) {
			const overlay = closer.closest(".overlay, .drawer-host");
			closeDialog(overlay);
			if (closer.dataset.toast) {
				showToast(closer.dataset.toast, { icon: closer.dataset.toastIcon, action: closer.dataset.toastAction });
			}
			return;
		}
		if (event.target.classList.contains("overlay")) {
			closeDialog(event.target);
		}
	});

	document.addEventListener("keydown", (event) => {
		if (event.key !== "Escape") {
			return;
		}
		const open = [...document.querySelectorAll(".overlay:not([hidden]), .drawer-host:not([hidden])")].pop();
		if (open) {
			closeDialog(open);
		}
	});

	document.addEventListener("click", (event) => {
		const toaster = event.target.closest("[data-toast]:not([data-close])");
		if (toaster) {
			closeAllPopovers();
			showToast(toaster.dataset.toast, { icon: toaster.dataset.toastIcon, action: toaster.dataset.toastAction });
		}
	});
}


/* ---------- Date picker (static month for mockups) ---------- */

function buildDatepicker(year, monthIndex, selectedDay) {

	const first = new Date(year, monthIndex, 1);
	const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
	const leading = first.getDay();
	const monthName = first.toLocaleString("en-US", { month: "long", year: "numeric" });
	let cells = ["S", "M", "T", "W", "T", "F", "S"].map((d) => `<span class="datepicker__dow">${d}</span>`).join("");
	for (let i = 0; i < leading; i += 1) {
		cells += '<span></span>';
	}
	for (let day = 1; day <= daysInMonth; day += 1) {
		cells += `<button type="button" class="datepicker__day" aria-selected="${day === selectedDay}" data-day="${day}">${day}</button>`;
	}
	return `
		<div class="datepicker__head">
			<button class="btn btn--ghost btn--icon btn--sm" type="button" aria-label="Previous month">${buildIcon("chev-left")}</button>
			<span>${monthName}</span>
			<button class="btn btn--ghost btn--icon btn--sm" type="button" aria-label="Next month">${buildIcon("chev-right")}</button>
		</div>
		<div class="datepicker__grid" role="grid">${cells}</div>
		<div class="datepicker__foot">
			<button class="btn btn--ghost btn--sm" type="button">Clear</button>
			<button class="btn btn--ghost btn--sm" type="button">Today</button>
		</div>`;
}

function wireDatepickers() {

	document.querySelectorAll("[data-datepicker]").forEach((host) => {
		const [year, month, day] = host.dataset.datepicker.split("-").map(Number);
		const pop = host.querySelector(".popover");
		pop.innerHTML = buildDatepicker(year, month - 1, day);
		pop.addEventListener("click", (event) => {
			const dayBtn = event.target.closest(".datepicker__day");
			if (!dayBtn) {
				return;
			}
			pop.querySelectorAll(".datepicker__day").forEach((btn) => btn.setAttribute("aria-selected", String(btn === dayBtn)));
			const label = new Date(year, month - 1, Number(dayBtn.dataset.day)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
			host.querySelector(".select-trigger__value").textContent = label;
			host.querySelector(".select-trigger__value").classList.remove("is-placeholder");
			closeAllPopovers();
		});
	});
}


/* ---------- Program ---------- */

document.addEventListener("DOMContentLoaded", () => {
	injectIconSprite();
	mountOrganizerShell();
	wireThemeToggles();
	wireSelects();
	wireSegmented();
	wireDialogs();
	wireDatepickers();
	window.mock = { showToast, buildIcon, openDialog };
	document.dispatchEvent(new Event("mock:ready"));
});
