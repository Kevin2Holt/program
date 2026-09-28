<script>
	/*
		Public signup calendar. A single `picks` list drives everything: an offering
		that's picked disappears from the day panel and from its day's markers, and
		removing it brings both back. Picks stay in the browser until submit; the
		server re-checks every one.
	*/
	import { onMount, tick } from "svelte";
	import { goto, invalidateAll, pushState, replaceState } from "$app/navigation";
	import { page } from "$app/state";
	import CalendarGrid from "$lib/components/calendar/CalendarGrid.svelte";
	import DayPanel from "$lib/components/calendar/DayPanel.svelte";
	import PicksSummary from "$lib/components/calendar/PicksSummary.svelte";
	import SignupForm from "$lib/components/calendar/SignupForm.svelte";
	import Alert from "$lib/components/ui/Alert.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import ItemMarker from "$lib/components/ui/ItemMarker.svelte";
	import { sendJson } from "$lib/api.js";
	import { findOverlapWith } from "$lib/calendar/overlap.js";
	import { formatDateShort } from "$lib/dates.js";
	import { createUuid } from "$lib/randomIds.js";
	import { formatTime12 } from "$lib/times.js";
	import { buildGridWeeks, buildPick, describeTimeZone, readStoredPicks, sortPicks, storePicks } from "$lib/components/calendar/publicCalendar.js";

	const PHONE_MAX_WIDTH_PX = 640;

	let { data } = $props();

	let picks = $state([]);
	let selectedDate = $state(null);
	let hiddenItemIds = $state([]);
	let picksSheetOpen = $state(false);
	let viewportWidth = $state(1024);
	let values = $state({ name: "", phone: "", contactMethod: "", numberType: "", email: "", notes: "" });
	let errors = $state(/** @type {Record<string, string>} */ ({}));
	let conflictMessages = $state([]);
	let submitting = $state(false);
	let idempotencyKey = $state("");
	let restoredDropped = $state(0);

	let calendar = $derived(data.calendar);
	let code = $derived(data.publicEvent.code);
	let step = $derived(page.state.signupStep === "details" && picks.length ? "details" : "pick");
	let isPhone = $derived(viewportWidth <= PHONE_MAX_WIDTH_PX);
	let itemsById = $derived(Object.fromEntries(calendar.items.map((item) => [item.id, item])));
	let weeks = $derived(calendar.grid ? buildGridWeeks(calendar.grid) : []);
	let pickedKeys = $derived(new Set(picks.map((pick) => pick.key)));
	let remainingByDate = $derived(buildRemaining(calendar.offeringsByDate, pickedKeys, hiddenItemIds));
	let pickCountByDate = $derived(countPicksByDate(picks));
	let hasAnyOffering = $derived(Object.keys(calendar.offeringsByDate).length > 0);


	function buildRemaining(offeringsByDate, picked, hidden) {

		const remaining = {};
		for (const [date, offerings] of Object.entries(offeringsByDate)) {
			const open = offerings.map((offering) => buildPick(date, offering)).filter((offering) => !picked.has(offering.key) && !hidden.includes(offering.itemId));
			if (open.length) {
				remaining[date] = open;
			}
		}
		return remaining;
	}

	function countPicksByDate(list) {

		const counts = {};
		for (const pick of list) {
			counts[pick.date] = (counts[pick.date] || 0) + 1;
		}
		return counts;
	}

	function findConflict(offering) {

		return calendar.timed && calendar.preventOverlap && offering.startTime ? findOverlapWith(offering, picks) : null;
	}

	function updatePicks(next) {

		picks = sortPicks(next);
		storePicks(code, picks);
	}

	function addPick(offering) {

		// No toast: the panel, the day's markers, and the summary all change visibly (and the panel announces it).
		updatePicks([...picks, offering]);
	}

	function removePick(pick) {

		updatePicks(picks.filter((existing) => existing.key !== pick.key));
	}

	function toggleHidden(itemId) {

		hiddenItemIds = hiddenItemIds.includes(itemId) ? hiddenItemIds.filter((id) => id !== itemId) : [...hiddenItemIds, itemId];
	}

	function selectDate(date) {

		selectedDate = date === selectedDate ? null : date;
		picksSheetOpen = false;
	}

	async function goToDetails() {

		idempotencyKey ||= createUuid();
		conflictMessages = [];
		pushState("", { signupStep: "details" });
		await tick();
		window.scrollTo({ top: 0 });
		document.getElementById("signup-name")?.focus();
	}

	function goBackToCalendar() {

		if (page.state.signupStep === "details") {
			history.back();
		}
	}

	function describePick(pick) {

		const item = itemsById[pick.itemId];
		return `${item?.name || "Item"} on ${formatDateShort(pick.date)}${pick.startTime ? ` at ${formatTime12(pick.startTime)}` : ""}`;
	}

	async function submitSignup() {

		submitting = true;
		errors = {};
		const sent = [...picks];
		const result = await sendJson("POST", `/api/public/${code}/calendar/bookings`, page.data.csrfToken, {
			...values,
			idempotencyKey,
			selections: sent.map(({ itemId, date, timeId }) => ({ itemId, date, timeId }))
		});
		submitting = false;

		if (result.ok) {
			storePicks(code, []);
			await goto(`/${code}/calendar/confirmation/${result.reference}`, { replaceState: true });
			return;
		}
		if (result.errors?.selections && Array.isArray(result.errors.selections)) {
			const failed = result.errors.selections.filter((entry) => !entry.ok);
			conflictMessages = failed.map((entry) => `${describePick(sent[entry.index])}: ${entry.message}`);
			const failedKeys = new Set(failed.map((entry) => sent[entry.index].key));
			updatePicks(picks.filter((pick) => !failedKeys.has(pick.key)));
			await invalidateAll();
			if (picks.length) {
				// Refreshing availability resets shallow-routing state; stay on the details step.
				replaceState("", { signupStep: "details" });
			}
			else {
				goBackToCalendar();
			}
			window.scrollTo({ top: 0, behavior: "smooth" });
			return;
		}
		errors = result.errors || {};
		if (!Object.keys(errors).length || errors.form || errors.selections) {
			conflictMessages = [result.message];
		}
	}

	onMount(() => {
		// Restore picks from earlier in this visit, keeping only those still open.
		const stored = readStoredPicks(code);
		const stillOpen = stored.filter((pick) => (calendar.offeringsByDate[pick.date] || []).some((offering) => buildPick(pick.date, offering).key === pick.key));
		restoredDropped = stored.length - stillOpen.length;
		updatePicks(stillOpen);
	});
</script>

<svelte:head><title>{calendar.title} · {data.publicEvent.name}</title></svelte:head>
<svelte:window bind:innerWidth={viewportWidth} />

{#if step === "details"}
	<main class="narrow">
		<button class="step-back link-button" type="button" onclick={goBackToCalendar}><Icon name="arrow-left" />Back to calendar</button>
		<h1 class="cal-head__title">Almost done</h1>
		<p class="cal-head__sub" style="margin-bottom: var(--space-5)">Check your selections and add your details.</p>

		{#if conflictMessages.length}
			<div style="margin-bottom: var(--space-4)">
				<Alert tone="warning" title={conflictMessages.length === 1 ? "One selection isn't available anymore" : "Some selections aren't available anymore"} role="alert">
					<ul class="conflict-list">{#each conflictMessages as message (message)}<li>{message}</li>{/each}</ul>
					{#if picks.length}Your other selections are still here.{/if}
				</Alert>
			</div>
		{/if}

		<div style="margin-bottom: var(--space-6)">
			<PicksSummary {picks} {itemsById} onedit={goBackToCalendar} />
		</div>

		<form
			class="stack"
			style="--stack-gap: var(--space-4)"
			novalidate
			onsubmit={(event) => {
				event.preventDefault();
				submitSignup();
			}}
		>
			<h2 class="section-title" style="margin-bottom: 0">Your details</h2>
			<SignupForm formFields={calendar.formFields} bind:values {errors} />
			<Button type="submit" variant="primary" size="lg" block loading={submitting}>Sign up for {picks.length} {picks.length === 1 ? "spot" : "spots"}</Button>
		</form>
	</main>
{:else}
	<main class="cal-page">
		<div class="cal-head">
			<div>
				<h1 class="cal-head__title">{calendar.title}</h1>
				<p class="cal-head__sub">
					{#if calendar.status === "closed"}Signups are closed.{:else}Pick one or more days, then add your details.{/if}
					{#if calendar.timed} Times are in {describeTimeZone(calendar.timeZone)}.{/if}
				</p>
			</div>
		</div>

		{#if restoredDropped > 0}
			<div style="margin-bottom: var(--space-4)"><Alert tone="warning">{restoredDropped === 1 ? "One of your earlier selections" : `${restoredDropped} of your earlier selections`} isn't available anymore and was removed.</Alert></div>
		{/if}
		{#if conflictMessages.length && !picks.length}
			<div style="margin-bottom: var(--space-4)">
				<Alert tone="warning" title="Those spots were just taken" role="alert"><ul class="conflict-list">{#each conflictMessages as message (message)}<li>{message}</li>{/each}</ul></Alert>
			</div>
		{/if}

		{#if calendar.status === "closed"}
			<EmptyState icon="lock" title="Signups are closed" text="This calendar isn't taking new signups right now." solid />
		{:else if !hasAnyOffering && !picks.length}
			<EmptyState icon="calendar" title="Nothing is open right now" text="Every spot is taken or unavailable. Check back later." solid />
		{:else}
			{#if calendar.items.length > 1}
				<div class="cal-legend" role="group" aria-label="Show or hide items" style="margin-bottom: var(--space-4)">
					{#each calendar.items as item (item.id)}
						<button class="legend-chip" type="button" aria-pressed={!hiddenItemIds.includes(item.id)} onclick={() => toggleHidden(item.id)}>
							<ItemMarker color={item.color} shape={item.shape} glyph={item.glyph} />{item.name}
						</button>
					{/each}
				</div>
			{/if}

			<div class="cal-layout">
				<CalendarGrid
					{weeks}
					today={calendar.today}
					window={calendar.window}
					offeringsByDate={remainingByDate}
					{pickCountByDate}
					{itemsById}
					{selectedDate}
					onselect={selectDate}
				/>

				<div class="cal-side">
					{#if selectedDate}
						<DayPanel
							date={selectedDate}
							offerings={remainingByDate[selectedDate] || []}
							pickedCount={pickCountByDate[selectedDate] || 0}
							{itemsById}
							{findConflict}
							onadd={addPick}
							onclose={() => (selectedDate = null)}
						/>
					{:else if !isPhone}
						<section class="day-panel"><div class="day-panel__empty"><Icon name="calendar" /><p style="margin-top: var(--space-2)">Pick a day on the calendar to see what's open.</p></div></section>
					{/if}
					{#if !isPhone || picksSheetOpen}
						<PicksSummary {picks} {itemsById} onremove={removePick} oncontinue={goToDetails} open={picksSheetOpen} />
					{/if}
				</div>
			</div>

			{#if isPhone && picks.length}
				<div class="pick-bar">
					<button class="pick-bar__count grow" type="button" aria-expanded={picksSheetOpen} onclick={() => {
						picksSheetOpen = !picksSheetOpen;
						if (picksSheetOpen) {
							selectedDate = null;
						}
					}}>
						<span class="pick-bar__markers">{#each picks.slice(0, 4) as pick (pick.key)}<ItemMarker {...itemsById[pick.itemId]} size="sm" />{/each}</span>
						{picks.length} selected <Icon name={picksSheetOpen ? "chev-down" : "chev-up"} class="subtle" />
					</button>
					<Button variant="primary" onclick={goToDetails}>Continue</Button>
				</div>
			{/if}
		{/if}
	</main>
{/if}
