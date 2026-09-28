<script>
	/* The selected day's open offerings. Adding one keeps the day and the panel open. */
	import Icon from "../ui/Icon.svelte";
	import ItemMarker from "../ui/ItemMarker.svelte";
	import { formatDateLong } from "$lib/dates.js";
	import { formatTime12, formatTimeRange } from "$lib/times.js";

	let { date, offerings, pickedCount, itemsById, findConflict, onadd, onclose } = $props();
</script>

<section class="day-panel" aria-labelledby="day-panel-title">
	<div class="day-panel__head">
		<div>
			<h2 class="day-panel__date" id="day-panel-title">{formatDateLong(date)}</h2>
			<div class="day-panel__sub" aria-live="polite">{offerings.length ? `${offerings.length} open` : "Nothing else open"}{pickedCount ? ` · ${pickedCount} in your selections` : ""}</div>
		</div>
		<button class="btn btn--ghost btn--icon" type="button" aria-label="Close day" onclick={onclose}><Icon name="x" /></button>
	</div>
	{#if offerings.length}
		<ul class="day-panel__list">
			{#each offerings as offering (offering.key)}
				{@const item = itemsById[offering.itemId]}
				{@const conflict = findConflict(offering)}
				<li>
					<button
						class="slot"
						class:is-conflict={Boolean(conflict)}
						type="button"
						aria-disabled={conflict ? "true" : undefined}
						aria-label="{conflict ? "" : "Add "}{item.name}{offering.startTime ? `, ${formatTimeRange(offering.startTime, offering.durationMinutes)}` : ""}{conflict ? `: overlaps your ${formatTime12(conflict.startTime)} selection` : ""}"
						onclick={() => !conflict && onadd(offering)}
					>
						<ItemMarker color={item.color} shape={item.shape} glyph={item.glyph} size="lg" />
						<span class="slot__main">
							<span class="slot__name">{item.name}</span>
							{#if offering.startTime}
								<span class="slot__time">{formatTimeRange(offering.startTime, offering.durationMinutes)}{offering.label ? ` · ${offering.label}` : ""}{conflict ? ` · overlaps your ${formatTime12(conflict.startTime)} pick` : ""}</span>
							{/if}
						</span>
						<span class="slot__add" aria-hidden="true"><Icon name={conflict ? "ban" : "plus"} /></span>
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="day-panel__empty">You've picked everything open on this day.</div>
	{/if}
</section>
