<script>
	/*
		Paper-calendar week grid: Sunday–Saturday columns, one marker per open
		offering (capped with "+N"), days outside the window or in the past muted.
		Arrow keys move between selectable days.
	*/
	import ItemMarker from "../ui/ItemMarker.svelte";
	import { DAYS_PER_WEEK, formatDateLong, formatMonthShort } from "$lib/dates.js";

	const MARKER_CAP_DESKTOP = 8;
	const MARKER_CAP_PHONE = 5;
	const PHONE_MAX_WIDTH_PX = 640;
	const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	const KEY_STEPS = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -DAYS_PER_WEEK, ArrowDown: DAYS_PER_WEEK };

	let { weeks, today, window, offeringsByDate, pickCountByDate, itemsById, selectedDate, onselect } = $props();

	let viewportWidth = $state(1024);
	let gridEl = $state();
	let markerCap = $derived(viewportWidth <= PHONE_MAX_WIDTH_PX ? MARKER_CAP_PHONE : MARKER_CAP_DESKTOP);


	function checkInWindow(date) {

		return Boolean(window) && date >= window.firstBookable && date <= window.end;
	}

	function checkSelectable(date) {

		return checkInWindow(date) && ((offeringsByDate[date]?.length || 0) > 0 || (pickCountByDate[date] || 0) > 0);
	}

	function describeDay(date) {

		const open = offeringsByDate[date]?.length || 0;
		const picked = pickCountByDate[date] || 0;
		if (!checkInWindow(date)) {
			return `${formatDateLong(date)}, unavailable`;
		}
		return `${formatDateLong(date)}, ${open ? `${open} available` : "nothing available"}${picked ? `, ${picked} selected` : ""}`;
	}

	function moveFocus(event) {

		const step = KEY_STEPS[event.key];
		if (!step) {
			return;
		}
		const cells = [...gridEl.querySelectorAll(".cal-day")];
		let index = cells.indexOf(event.target.closest(".cal-day"));
		do {
			index += step;
		} while (index >= 0 && index < cells.length && cells[index].tagName !== "BUTTON");
		if (cells[index]) {
			event.preventDefault();
			cells[index].focus();
		}
	}
</script>

<svelte:window bind:innerWidth={viewportWidth} />

<div class="cal-grid" role="grid" tabindex="-1" aria-label="Signup calendar" bind:this={gridEl} onkeydown={moveFocus}>
	<div class="cal-dow" role="row">
		{#each WEEKDAYS as weekday (weekday)}<span role="columnheader">{weekday}</span>{/each}
	</div>
	{#each weeks as week (week[0])}
		<div class="cal-week" role="row">
			{#each week as date (date)}
				{@const offerings = offeringsByDate[date] || []}
				{@const shown = offerings.slice(0, offerings.length > markerCap ? markerCap - 1 : markerCap)}
				{@const picked = pickCountByDate[date] || 0}
				{@const dayNumber = Number(date.slice(8))}
				{#if checkSelectable(date)}
					<button
						class="cal-day"
						class:is-today={date === today}
						class:is-selected={date === selectedDate}
						type="button"
						role="gridcell"
						aria-selected={date === selectedDate}
						aria-label={describeDay(date)}
						data-date={date}
						tabindex={date === selectedDate || (!selectedDate && date === (Object.keys(offeringsByDate)[0] || "")) ? 0 : -1}
						onclick={() => onselect(date)}
					>
						<span class="cal-day__num">{#if dayNumber === 1}<span class="cal-day__mon">{formatMonthShort(date)} </span>{/if}{dayNumber}</span>
						{#if picked}<span class="cal-day__picked" aria-hidden="true">{picked}</span>{/if}
						<span class="cal-day__markers" aria-hidden="true">
							{#each shown as offering, index (index)}
								{@const item = itemsById[offering.itemId]}
								<ItemMarker color={item.color} shape={item.shape} glyph={item.glyph} size="sm" />
							{/each}
							{#if offerings.length > shown.length}<span class="cal-day__more">+{offerings.length - shown.length}</span>{/if}
						</span>
					</button>
				{:else}
					<div class="cal-day" class:is-today={date === today} class:is-disabled={!checkInWindow(date)} class:is-empty-day={checkInWindow(date)} role="gridcell" aria-disabled="true" aria-label={describeDay(date)}>
						<span class="cal-day__num">{#if dayNumber === 1}<span class="cal-day__mon">{formatMonthShort(date)} </span>{/if}{dayNumber}</span>
					</div>
				{/if}
			{/each}
		</div>
	{/each}
</div>
