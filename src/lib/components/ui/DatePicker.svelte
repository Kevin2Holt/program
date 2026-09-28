<script>
	/*
		Date picker: a trigger showing the chosen date and a month-grid popover.
		value is "YYYY-MM-DD" or "". Keyboard in the grid: arrows move a day/week,
		PageUp/PageDown move a month, Home/End go to the week's ends, Enter picks,
		Escape closes.
	*/
	import { tick } from "svelte";
	import Icon from "./Icon.svelte";
	import { dismissable, placePopover } from "./floating.js";
	import { addDays, addMonths, buildIsoDate, countDaysInMonth, DAYS_PER_WEEK, findMonthStart, formatDateFull, formatDateMedium, formatMonthYear, getWeekday, parseIsoDate } from "$lib/dates.js";

	const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
	const KEY_DAY_STEPS = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -DAYS_PER_WEEK, ArrowDown: DAYS_PER_WEEK };

	let {
		value = $bindable(""),
		min = "",
		max = "",
		placeholder = "Pick a date",
		id: idProp = undefined,
		labelledBy = undefined,
		label = undefined,
		describedBy = undefined,
		invalid = false,
		clearable = false,
		todayDate = "",
		align = "left",
		onchange = undefined
	} = $props();

	const uid = $props.id();
	let id = $derived(idProp || `date-${uid}`);
	let open = $state(false);
	let focusedDate = $state("");
	let triggerEl = $state();
	let gridEl = $state();

	let viewMonthStart = $derived(findMonthStart(focusedDate || value || todayDate || new Date().toISOString().slice(0, 10)));
	let weeks = $derived(buildMonthWeeks(viewMonthStart));


	function buildMonthWeeks(monthStart) {

		const date = parseIsoDate(monthStart);
		const leadingBlanks = getWeekday(monthStart);
		const dayCount = countDaysInMonth(date.getUTCFullYear(), date.getUTCMonth());
		const cells = Array(leadingBlanks).fill(null);
		for (let day = 1; day <= dayCount; day += 1) {
			cells.push(buildIsoDate(date.getUTCFullYear(), date.getUTCMonth(), day));
		}
		while (cells.length % DAYS_PER_WEEK) {
			cells.push(null);
		}
		const rows = [];
		for (let index = 0; index < cells.length; index += DAYS_PER_WEEK) {
			rows.push(cells.slice(index, index + DAYS_PER_WEEK));
		}
		return rows;
	}

	function checkSelectable(isoDate) {

		return (!min || isoDate >= min) && (!max || isoDate <= max);
	}

	async function openPicker() {

		open = true;
		focusedDate = value || todayDate || new Date().toISOString().slice(0, 10);
		await tick();
		focusDayButton();
	}

	function closePicker(returnFocus = true) {

		open = false;
		if (returnFocus) {
			triggerEl?.focus();
		}
	}

	async function focusDayButton() {

		await tick();
		gridEl?.querySelector(`[data-date="${focusedDate}"]`)?.focus();
	}

	function pickDate(isoDate) {

		if (!checkSelectable(isoDate)) {
			return;
		}
		if (isoDate !== value) {
			value = isoDate;
			onchange?.(isoDate);
		}
		closePicker();
	}

	function clearDate() {

		value = "";
		onchange?.("");
		closePicker();
	}

	function moveFocus(nextDate) {

		focusedDate = nextDate;
		focusDayButton();
	}

	function handleGridKeydown(event) {

		if (KEY_DAY_STEPS[event.key]) {
			event.preventDefault();
			moveFocus(addDays(focusedDate, KEY_DAY_STEPS[event.key]));
		}
		else if (event.key === "PageUp" || event.key === "PageDown") {
			event.preventDefault();
			moveFocus(addMonths(focusedDate, event.key === "PageUp" ? -1 : 1));
		}
		else if (event.key === "Home") {
			event.preventDefault();
			moveFocus(addDays(focusedDate, -getWeekday(focusedDate)));
		}
		else if (event.key === "End") {
			event.preventDefault();
			moveFocus(addDays(focusedDate, DAYS_PER_WEEK - 1 - getWeekday(focusedDate)));
		}
		else if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			pickDate(focusedDate);
		}
	}
</script>

<div
	class="select"
	use:dismissable={(reason) => {
		if (open) {
			closePicker(reason === "escape");
		}
	}}
>
	<button
		bind:this={triggerEl}
		{id}
		class="select-trigger"
		type="button"
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-labelledby={labelledBy ? `${labelledBy} ${id}` : undefined}
		aria-label={labelledBy ? undefined : label}
		aria-describedby={describedBy}
		data-invalid={invalid || undefined}
		onclick={() => (open ? closePicker() : openPicker())}
	>
		<span class="select-trigger__value" class:is-placeholder={!value}>{value ? formatDateMedium(value) : placeholder}</span>
		<Icon name="calendar" />
	</button>

	{#if open}
		<div class="popover datepicker" class:popover--right={align === "right"} role="dialog" aria-label="Choose a date" use:placePopover>
			<div class="datepicker__head">
				<button class="btn btn--ghost btn--icon btn--sm" type="button" aria-label="Previous month" onclick={() => moveFocus(addMonths(focusedDate, -1))}><Icon name="chev-left" /></button>
				<span aria-live="polite">{formatMonthYear(viewMonthStart)}</span>
				<button class="btn btn--ghost btn--icon btn--sm" type="button" aria-label="Next month" onclick={() => moveFocus(addMonths(focusedDate, 1))}><Icon name="chev-right" /></button>
			</div>
			<div bind:this={gridEl} class="datepicker__grid" role="grid" tabindex="-1" onkeydown={handleGridKeydown}>
				<div class="datepicker__row" role="row">
					{#each WEEKDAY_INITIALS as initial, index (index)}
						<span class="datepicker__dow" role="columnheader" aria-hidden="true">{initial}</span>
					{/each}
				</div>
				{#each weeks as week, weekIndex (weekIndex)}
					<div class="datepicker__row" role="row">
						{#each week as cellDate, dayIndex (dayIndex)}
							{#if cellDate}
								<button
									role="gridcell"
									class="datepicker__day"
									class:is-today={cellDate === todayDate}
									type="button"
									data-date={cellDate}
									tabindex={cellDate === focusedDate ? 0 : -1}
									aria-selected={cellDate === value}
									aria-label={formatDateFull(cellDate)}
									disabled={!checkSelectable(cellDate)}
									onclick={() => pickDate(cellDate)}
								>{Number(cellDate.slice(8))}</button>
							{:else}
								<span role="gridcell"></span>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
			<div class="datepicker__foot">
				{#if clearable}
					<button class="btn btn--ghost btn--sm" type="button" onclick={clearDate}>Clear</button>
				{:else}
					<span></span>
				{/if}
				{#if todayDate && checkSelectable(todayDate)}
					<button class="btn btn--ghost btn--sm" type="button" onclick={() => pickDate(todayDate)}>Today</button>
				{/if}
			</div>
		</div>
	{/if}
</div>
