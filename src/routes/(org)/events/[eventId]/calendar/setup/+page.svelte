<script>
	/*
		Calendar setup. Every change autosaves (debounced); the server validates the
		whole merged config and returns field errors, shown next to the field.
		Only the fields for the current choices are shown.
	*/
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { invalidateAll } from "$app/navigation";
	import Topbar from "$lib/components/app/Topbar.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Checkbox from "$lib/components/ui/Checkbox.svelte";
	import DatePicker from "$lib/components/ui/DatePicker.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import NumberStepper from "$lib/components/ui/NumberStepper.svelte";
	import SaveState from "$lib/components/ui/SaveState.svelte";
	import Segmented from "$lib/components/ui/Segmented.svelte";
	import Select from "$lib/components/ui/Select.svelte";
	import Switch from "$lib/components/ui/Switch.svelte";
	import { createSaveQueue } from "$lib/components/program/saveQueue.svelte.js";
	import { showToast } from "$lib/components/ui/toast.svelte.js";
	import { sendJson } from "$lib/api.js";
	import { formatDateShort, todayInTimeZone } from "$lib/dates.js";
	import { deriveDateWindow, MIN_DAYS_AHEAD_MAX, ROLLING_LIMITS } from "$lib/calendar/dateWindow.js";
	import { FORM_FIELD_KEYS, FORM_FIELD_LABELS, PHONE_DEPENDENT_FIELDS } from "$lib/calendar/formFields.js";

	const AUTOSAVE_DEBOUNCE_MS = 500;
	const UNIT_LABELS = { days: "days", weeks: "weeks", months: "months" };

	let { data } = $props();

	const saves = createSaveQueue(AUTOSAVE_DEBOUNCE_MS);
	// The page owns its editable copy after load and saves changes back.
	// svelte-ignore state_referenced_locally
	const config = $state(structuredClone(data.config));
	let errors = $state(/** @type {Record<string, string>} */ ({}));
	let pendingChanges = {};
	let timeZoneOptions = $state([{ value: config.timeZone, label: config.timeZone }]);

	let today = $derived(todayInTimeZone(config.timeZone));
	let previewWindow = $derived(config.windowMode === "rolling" ? deriveDateWindow(config, today) : null);
	let rollingLimits = $derived(ROLLING_LIMITS[config.rollingUnit]);


	function buildTimeZoneOptions() {

		const now = new Date();
		return Intl.supportedValuesOf("timeZone").map((zone) => {
			const offset = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(now).find((part) => part.type === "timeZoneName")?.value || "";
			return { value: zone, label: zone, meta: offset.replace("GMT", "UTC") || "UTC" };
		});
	}

	function saveChanges(changes) {

		Object.assign(pendingChanges, changes);
		saves.schedule("config", async () => {
			const sending = pendingChanges;
			pendingChanges = {};
			const result = await sendJson("PATCH", `/api/events/${data.event.id}/calendar/config`, page.data.csrfToken, { changes: sending });
			if (result.ok) {
				errors = {};
				// Keep server-normalized values (e.g. email confirmation turned off without email).
				config.emailConfirmation = result.config.emailConfirmation;
				config.formFields = result.config.formFields;
				if ("status" in sending || "title" in sending) {
					invalidateAll();
				}
				return result;
			}
			errors = result.errors || {};
			// Validation errors aren't a failed save; nothing is retried until the field changes.
			return result.code === "invalid" ? { ok: true } : result;
		});
	}

	function setField(key, value) {

		config[key] = value;
		saveChanges({ [key]: value });
	}

	function setFormField(key, part, value) {

		config.formFields[key][part] = value;
		if (part === "required" && value) {
			config.formFields[key].on = true;
		}
		if (part === "on" && !value) {
			config.formFields[key].required = false;
		}
		saveChanges({ formFields: $state.snapshot(config.formFields) });
	}

	onMount(() => {
		timeZoneOptions = buildTimeZoneOptions();
		if (page.url.searchParams.get("created")) {
			showToast("Calendar created. Start with the basics here, then add Items.");
			history.replaceState(history.state, "", page.url.pathname);
		}
	});
</script>

<svelte:head><title>Calendar setup · {data.event.name}</title></svelte:head>

<Topbar crumbs={[{ label: data.event.name, href: `/events/${data.event.id}/program` }, { label: "Calendar", href: `/events/${data.event.id}/calendar` }, { label: "Setup" }]}>
	{#snippet actions()}
		<SaveState status={saves.state.status} onretry={saves.retryFailed} />
		<Button size="sm" icon="external" href="{data.publicUrl}/calendar" target="_blank"><span>View public page</span></Button>
	{/snippet}
</Topbar>

<div class="content" style="max-width: 56rem">
	<div class="page-head">
		<div>
			<h1 class="page-head__title">Calendar setup</h1>
			<p class="page-head__sub">Changes save automatically.</p>
		</div>
	</div>

	<div class="stack" style="--stack-gap: var(--space-4)">
		<section class="card" aria-labelledby="basics-h">
			<div class="card__head"><h2 class="card__title" id="basics-h">Basics</h2></div>
			<div class="settings-row">
				<div><label class="settings-row__label" for="cal-title">Title</label><div class="settings-row__desc">Shown at the top of the public calendar.</div></div>
				<div class="field" class:has-error={errors.title}>
					<input id="cal-title" class="input" value={config.title} maxlength="120" oninput={(event) => setField("title", event.currentTarget.value)} aria-invalid={Boolean(errors.title) || undefined} />
					{#if errors.title}<span class="error-msg"><Icon name="alert-circle" />{errors.title}</span>{/if}
				</div>
			</div>
			<div class="settings-row">
				<div><div class="settings-row__label" id="status-label">Status</div><div class="settings-row__desc">Draft is hidden from the public. Closed shows the calendar but stops new signups.</div></div>
				<div>
					<Segmented
						value={config.status}
						labelledBy="status-label"
						options={[{ value: "draft", label: "Draft" }, { value: "open", label: "Open" }, { value: "closed", label: "Closed" }]}
						onchange={(value) => setField("status", value)}
					/>
				</div>
			</div>
			<div class="settings-row">
				<div><div class="settings-row__label" id="tz-label">Event Time Zone</div><div class="settings-row__desc">Used for dates, times, confirmations, and calendar files.</div></div>
				<div class="field" class:has-error={errors.timeZone} style="max-width: 24rem">
					<Select value={config.timeZone} labelledBy="tz-label" searchable searchPlaceholder="Search time zones" options={timeZoneOptions} onchange={(value) => setField("timeZone", value)} />
					{#if errors.timeZone}<span class="error-msg"><Icon name="alert-circle" />{errors.timeZone}</span>{/if}
				</div>
			</div>
		</section>

		<section class="card" aria-labelledby="dates-h">
			<div class="card__head"><h2 class="card__title" id="dates-h">Dates</h2></div>
			<div class="settings-row">
				<div><div class="settings-row__label" id="window-label">Date window</div><div class="settings-row__desc">Which dates people can sign up for.</div></div>
				<div class="stack">
					<Segmented
						value={config.windowMode}
						labelledBy="window-label"
						options={[{ value: "fixed", label: "Fixed dates" }, { value: "rolling", label: "Rolling window" }]}
						onchange={(value) => setField("windowMode", value)}
					/>
					{#if config.windowMode === "fixed"}
						<div class="form-grid" style="max-width: 28rem">
							<div class="field" class:has-error={errors.fixedStart}>
								<span class="label" id="start-label">Start date</span>
								<DatePicker value={config.fixedStart || ""} labelledBy="start-label" todayDate={today} invalid={Boolean(errors.fixedStart)} onchange={(value) => setField("fixedStart", value)} />
								{#if errors.fixedStart}<span class="error-msg"><Icon name="alert-circle" />{errors.fixedStart}</span>{/if}
							</div>
							<div class="field" class:has-error={errors.fixedEnd}>
								<span class="label" id="end-label">End date</span>
								<DatePicker value={config.fixedEnd || ""} labelledBy="end-label" todayDate={today} min={config.fixedStart || ""} align="right" invalid={Boolean(errors.fixedEnd)} onchange={(value) => setField("fixedEnd", value)} />
								{#if errors.fixedEnd}<span class="error-msg"><Icon name="alert-circle" />{errors.fixedEnd}</span>{/if}
							</div>
						</div>
					{:else}
						<div class="stack" style="--stack-gap: var(--space-2)">
							<div class="row row--wrap">
								<span class="muted" id="rolling-label">Show</span>
								<NumberStepper value={config.rollingSize} min={rollingLimits.min} max={rollingLimits.max} label="window size" onchange={(value) => setField("rollingSize", value)} />
								<div style="width: 8rem">
									<Select
										value={config.rollingUnit}
										label="Window unit"
										options={Object.entries(UNIT_LABELS).map(([value, label]) => ({ value, label }))}
										onchange={(value) => {
											config.rollingUnit = value;
											const limits = ROLLING_LIMITS[value];
											config.rollingSize = Math.min(limits.max, Math.max(limits.min, config.rollingSize));
											saveChanges({ rollingUnit: value, rollingSize: config.rollingSize });
										}}
									/>
								</div>
								<span class="muted">ahead</span>
							</div>
							{#if errors.rollingSize}<span class="error-msg"><Icon name="alert-circle" />{errors.rollingSize}</span>{/if}
							{#if previewWindow}
								<p class="hint">
									{#if config.rollingUnit === "days"}Today plus the next {config.rollingSize - 1} days.
									{:else if config.rollingUnit === "weeks"}This week plus the next {config.rollingSize} whole weeks (Sunday–Saturday). The next week opens on Sunday.
									{:else}This month plus the next {config.rollingSize} whole months.{/if}
									Right now: <strong class="tabular">{formatDateShort(previewWindow.start)} – {formatDateShort(previewWindow.end)}</strong>.
								</p>
							{/if}
						</div>
					{/if}
				</div>
			</div>
			<div class="settings-row">
				<div><div class="settings-row__label">Minimum days ahead</div><div class="settings-row__desc">0 lets people sign up for today.</div></div>
				<div class="stack" style="--stack-gap: var(--space-1-5)">
					<div class="row">
						<NumberStepper value={config.minDaysAhead} min={0} max={MIN_DAYS_AHEAD_MAX} label="minimum days ahead" onchange={(value) => setField("minDaysAhead", value)} />
						<span class="muted">{config.minDaysAhead === 1 ? "day" : "days"}</span>
					</div>
					<span class="hint">{config.minDaysAhead === 0 ? "Same-day signups are allowed." : `The earliest date people can pick is ${formatDateShort(deriveDateWindow({ ...config, windowMode: "rolling", rollingUnit: "days", rollingSize: 1 }, today).firstBookable)}.`}</span>
				</div>
			</div>
		</section>

		<section class="card" aria-labelledby="time-h">
			<div class="card__head"><h2 class="card__title" id="time-h">Times</h2></div>
			<div class="settings-row">
				<div><div class="settings-row__label">Timed signups</div><div class="settings-row__desc">Off: people pick a day. On: people pick a time on a day.</div></div>
				<div class="stack">
					<Switch checked={config.timed} label="Use times" onchange={(value) => setField("timed", value)} />
					{#if config.timed}
						<Switch checked={config.preventOverlap} label="Stop people picking overlapping times on the same day" onchange={(value) => setField("preventOverlap", value)} />
						<p class="hint">Give each Item its times on the <a href="/events/{data.event.id}/calendar/items">Items page</a>. Capacity then counts per time.</p>
					{/if}
				</div>
			</div>
		</section>

		<section class="card" aria-labelledby="form-h">
			<div class="card__head"><div><h2 class="card__title" id="form-h">Signup form</h2><p class="card__desc">Name is always asked. Choose the other details.</p></div></div>
			<div class="table-wrap" style="border: 0; border-radius: 0 0 var(--radius-lg) var(--radius-lg)">
				<table class="table">
					<thead><tr><th>Field</th><th>Ask for it</th><th>Required</th></tr></thead>
					<tbody>
						<tr><td>Name</td><td><span class="subtle">Always</span></td><td><span class="subtle">Always</span></td></tr>
						{#each FORM_FIELD_KEYS as key (key)}
							{#if !PHONE_DEPENDENT_FIELDS.includes(key) || config.formFields.phone.on}
								<tr>
									<td style:padding-left={PHONE_DEPENDENT_FIELDS.includes(key) ? "var(--space-8)" : undefined}>
										<span class:muted={PHONE_DEPENDENT_FIELDS.includes(key)}>{FORM_FIELD_LABELS[key]}</span>
									</td>
									<td><Switch checked={config.formFields[key].on} label="Ask for {FORM_FIELD_LABELS[key].toLowerCase()}" labelHidden onchange={(value) => setFormField(key, "on", value)} /></td>
									<td><Checkbox checked={config.formFields[key].required} label="{FORM_FIELD_LABELS[key]} required" labelHidden onchange={(value) => setFormField(key, "required", value)} /></td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="card" aria-labelledby="after-h">
			<div class="card__head"><h2 class="card__title" id="after-h">After signup</h2></div>
			<div class="settings-row">
				<div><div class="settings-row__label">Email confirmation</div><div class="settings-row__desc">Needs the email field.</div></div>
				<div class="stack" style="--stack-gap: var(--space-1-5)">
					<Switch checked={config.emailConfirmation} disabled={!config.formFields.email.on} label="Send a confirmation email" describedBy="email-confirm-hint" onchange={(value) => setField("emailConfirmation", value)} />
					{#if !config.formFields.email.on}<span class="hint" id="email-confirm-hint">Turn on “Email” in the signup form to use this.</span>{/if}
				</div>
			</div>
			<div class="settings-row">
				<div><div class="settings-row__label" id="ics-label">Add to calendar</div><div class="settings-row__desc">Offer a calendar file on the confirmation page.</div></div>
				<div class="stack">
					<Switch checked={config.icsEnabled} label="Offer “Add to my calendar”" onchange={(value) => setField("icsEnabled", value)} />
					{#if config.icsEnabled}
						<Segmented
							value={config.icsMode}
							labelledBy="ics-label"
							options={[{ value: "per_day", label: "One per day" }, { value: "separate", label: "One per selection" }, { value: "combined", label: "All in one" }]}
							onchange={(value) => setField("icsMode", value)}
						/>
					{/if}
				</div>
			</div>
		</section>
	</div>
</div>
