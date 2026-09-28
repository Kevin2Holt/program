<script>
	import { onMount } from "svelte";
	import Topbar from "$lib/components/app/Topbar.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import Form from "$lib/components/ui/Form.svelte";
	import ItemMarker from "$lib/components/ui/ItemMarker.svelte";
	import Status from "$lib/components/ui/Status.svelte";
	import { addDays, DAYS_PER_WEEK, formatDateMedium, formatDateShort, getWeekday } from "$lib/dates.js";
	import { formatTime12 } from "$lib/times.js";

	const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	const STATUS_SHORT = { available: "Open", full: "Full", blocked: "Blocked", out: "Out", archived: "Archived" };
	const STATUS_LABELS = { draft: "Draft", open: "Open", closed: "Closed" };

	let { data } = $props();

	let browserTimeZone = $state("");
	let overview = $derived(data.overview);
	let itemStatusByDate = $derived(overview ? buildStatusLookup(overview.days) : {});

	onMount(() => {
		browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});


	function buildStatusLookup(days) {

		const lookup = {};
		for (const day of days) {
			for (const entry of day.items) {
				lookup[`${entry.itemId}:${day.date}`] = entry;
			}
		}
		return lookup;
	}

	function describeCell(entry) {

		if (!entry) {
			return "";
		}
		if (entry.status === "blocked") {
			return entry.ruleId ? `Blocked by: ${overview.ruleTitles[entry.ruleId] || "a rule"}` : "Blocked";
		}
		if (entry.status === "out") {
			return "Outside the signup window";
		}
		if (entry.occurrences.length) {
			return entry.occurrences.map((occurrence) => `${formatTime12(occurrence.startTime)}: ${occurrence.used}/${occurrence.capacity} (${STATUS_SHORT[occurrence.status]})`).join("\n");
		}
		return `${entry.used} of ${entry.capacity} taken`;
	}

	function describeWindow(config) {

		if (config.windowMode === "fixed") {
			return `${formatDateMedium(config.fixedStart)} – ${formatDateMedium(config.fixedEnd)}`;
		}
		const unit = config.rollingSize === 1 ? config.rollingUnit.replace(/s$/, "") : config.rollingUnit;
		return config.rollingUnit === "days" ? `Next ${config.rollingSize} ${unit}` : `This ${config.rollingUnit.replace(/s$/, "")} + ${config.rollingSize} ${unit}`;
	}
</script>

<svelte:head><title>Calendar · {data.event.name}</title></svelte:head>

<Topbar crumbs={[{ label: data.event.name, href: `/events/${data.event.id}/program` }, { label: "Calendar" }]}>
	{#snippet actions()}
		{#if overview && overview.config.status !== "draft"}
			<Button size="sm" icon="external" href="{data.publicUrl}/calendar" target="_blank"><span>Public page</span></Button>
		{/if}
	{/snippet}
</Topbar>

<div class="content">
	{#if !overview}
		<div class="page-head"><div><h1 class="page-head__title">Signup calendar</h1></div></div>
		<EmptyState icon="calendar-plus" title="Add a signup calendar" text="Let people sign up for meals, sessions, or volunteer slots on dates you choose. You'll set the dates, add Items, and choose which details to ask for.">
			{#if data.canCreate}
				<Form action="?/create">
					{#snippet children({ pending })}
						<input type="hidden" name="timeZone" value={browserTimeZone} />
						<Button type="submit" variant="primary" icon="plus" loading={pending}>Create calendar</Button>
					{/snippet}
				</Form>
			{/if}
		</EmptyState>
	{:else}
		<div class="page-head">
			<div>
				<h1 class="page-head__title">{overview.config.title}</h1>
				<p class="page-head__sub">
					{describeWindow(overview.config)} · {overview.config.timeZone} ·
					<span class="status-inline status-inline--{overview.config.status}"><span class="dot"></span>{STATUS_LABELS[overview.config.status]}</span>
				</p>
			</div>
		</div>

		<div class="stats" style="margin-bottom: var(--space-5)">
			<div class="stat"><div class="stat__label">Upcoming signups</div><div class="stat__value">{overview.stats.upcoming}</div></div>
			<div class="stat"><div class="stat__label">Open this week</div><div class="stat__value">{overview.stats.openThisWeek}</div></div>
			<div class="stat"><div class="stat__label">Filled this week</div><div class="stat__value">{overview.stats.filledPercent === null ? "–" : `${overview.stats.filledPercent}%`}</div></div>
			<div class="stat"><div class="stat__label">New in 7 days</div><div class="stat__value">{overview.stats.recentBookings}</div></div>
		</div>

		{#if !overview.items.length}
			<EmptyState icon="shapes" title="Add the first Item" text="Items are what people sign up for, like a companionship to feed or a session to attend.">
				<Button variant="primary" icon="plus" href="/events/{data.event.id}/calendar/items">Add Items</Button>
			</EmptyState>
		{:else}
			<section class="card" aria-labelledby="week-title">
				<div class="card__head">
					<div class="row">
						<Button variant="ghost" size="sm" icon="chev-left" label="Previous week" href="?week={addDays(overview.weekStart, -DAYS_PER_WEEK)}" data-sveltekit-noscroll />
						<h2 class="card__title tabular" id="week-title">{formatDateShort(overview.weekStart)} – {formatDateShort(addDays(overview.weekStart, DAYS_PER_WEEK - 1))}</h2>
						<Button variant="ghost" size="sm" icon="chev-right" label="Next week" href="?week={addDays(overview.weekStart, DAYS_PER_WEEK)}" data-sveltekit-noscroll />
					</div>
					<div class="row row--wrap" style="--row-gap: var(--space-3)">
						<Status status="available" /><Status status="full" /><Status status="blocked" /><Status status="out" />
					</div>
				</div>
				<div style="overflow-x: auto">
					<div class="ovw" role="table" aria-label="Item availability by day">
						<div role="row" class="ovw__row">
							<div class="ovw__head" role="columnheader" style="text-align: left">Item</div>
							{#each overview.days as day (day.date)}
								<div class="ovw__head" class:is-today={day.date === overview.today} role="columnheader">{WEEKDAY_SHORT[getWeekday(day.date)]}<b>{Number(day.date.slice(8))}</b></div>
							{/each}
						</div>
						{#each overview.items as item (item.id)}
							<div role="row" class="ovw__row">
								<div class="ovw__item" role="rowheader"><span class="item-chip"><ItemMarker color={item.color} shape={item.shape} glyph={item.glyph} />{item.name}</span></div>
								{#each overview.days as day (day.date)}
									{@const entry = itemStatusByDate[`${item.id}:${day.date}`]}
									<div class="ovw__cell" role="cell" title={describeCell(entry)} tabindex="0" aria-label="{item.name}, {formatDateShort(day.date)}: {STATUS_SHORT[entry.status]}. {describeCell(entry)}">
										<Status status={entry.status} label={entry.occurrences.length && entry.status === "available" ? `${entry.occurrences.filter((occurrence) => occurrence.status === "available").length} open` : STATUS_SHORT[entry.status]} />
									</div>
								{/each}
							</div>
						{/each}
					</div>
				</div>
			</section>
			<p class="hint" style="margin-top: var(--space-2)">Hover or focus a cell to see why it's blocked, or how full it is.</p>
		{/if}
	{/if}
</div>
