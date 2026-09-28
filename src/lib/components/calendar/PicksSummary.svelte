<script>
	/* "Your selections": removing one restores it in the panel and on the grid. */
	import Icon from "../ui/Icon.svelte";
	import ItemMarker from "../ui/ItemMarker.svelte";
	import { formatDateShort } from "$lib/dates.js";
	import { formatTimeRange } from "$lib/times.js";

	let { picks, itemsById, onremove = undefined, oncontinue = undefined, editHref = undefined, onedit = undefined, open = false, title = "Your selections", headAction = undefined } = $props();
</script>

<section class="picks" class:is-open={open} aria-labelledby="picks-title">
	<div class="picks__head">
		<h2 class="picks__title" id="picks-title">{title}</h2>
		{#if headAction}
			{@render headAction()}
		{:else if onedit}
			<button class="btn btn--ghost btn--sm" type="button" onclick={onedit}>Edit</button>
		{:else if editHref}
			<a class="btn btn--ghost btn--sm" href={editHref}>Edit</a>
		{:else}
			<span class="badge" class:badge--accent={picks.length > 0}>{picks.length}</span>
		{/if}
	</div>
	{#if picks.length}
		<ul class="picks__list">
			{#each picks as pick (pick.key)}
				{@const item = itemsById[pick.itemId]}
				<li class="pick">
					<ItemMarker color={item?.color || "slate"} shape={item?.shape || "circle"} glyph={item?.glyph} size="lg" />
					<div class="pick__main">
						<div class="pick__name">{pick.itemName || item?.name}</div>
						<div class="pick__when">{formatDateShort(pick.date)}{pick.startTime ? ` · ${formatTimeRange(pick.startTime, pick.durationMinutes)}` : ""}{pick.label ? ` · ${pick.label}` : ""}</div>
					</div>
					{#if onremove}
						<button class="btn btn--ghost btn--icon btn--sm" type="button" aria-label="Remove {item?.name} on {formatDateShort(pick.date)}" onclick={() => onremove(pick)}><Icon name="x" /></button>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<div class="picks__empty">Nothing selected yet. Items you add will appear here.</div>
	{/if}
	{#if oncontinue}
		<div class="picks__foot">
			<button class="btn btn--primary btn--lg btn--block" type="button" disabled={!picks.length} onclick={oncontinue}><span>Continue</span><Icon name="arrow-right" /></button>
		</div>
	{/if}
</section>
