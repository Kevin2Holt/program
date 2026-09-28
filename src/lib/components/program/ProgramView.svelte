<script>
	/*
		Read-only program rendering. The public page and the editor's live preview
		both use this, so they can't drift apart. Text HTML is sanitized on the
		server before it reaches the public page.
	*/
	import Icon from "../ui/Icon.svelte";

	// The default empty text speaks to organizers; the public page passes its own.
	let { header, blocks, compact = false, emptyMessage = "Nothing here yet. Add a block to start the program.", children = undefined } = $props();

	let hasMeta = $derived(Boolean(header.date || header.time || header.place));
	let isEmpty = $derived(!header.title && !header.eyebrow && !hasMeta && blocks.length === 0);


	function listFilledRows(rows) {

		return rows.filter((row) => row.label || row.value);
	}
</script>

<article class="program" class:program--compact={compact}>
	{#if header.eyebrow}<p class="program__eyebrow caps">{header.eyebrow}</p>{/if}
	{#if header.title}<h1 class="program__title">{header.title}</h1>{/if}
	{#if hasMeta}
		<div class="program__meta">
			{#if header.date}<span><Icon name="calendar" />{header.date}</span>{/if}
			{#if header.time}<span><Icon name="clock" />{header.time}</span>{/if}
			{#if header.place}<span><Icon name="pin" />{header.place}</span>{/if}
		</div>
	{/if}

	{#if isEmpty}
		<p class="program__empty">{emptyMessage}</p>
	{/if}

	<div class="program__blocks">
		{#each blocks as block (block.id)}
			{#if block.type === "text"}
				<div class="pblock-text">{@html block.html}</div>
			{:else if block.type === "label_value"}
				{#if listFilledRows(block.content.rows).length}
					<dl class="pblock-lv">
						{#each listFilledRows(block.content.rows) as row (row.id)}
							<dt>{row.label}</dt>
							<dd>{row.value}</dd>
						{/each}
					</dl>
				{/if}
			{:else if block.type === "separator"}
				{#if block.content.variant === "space"}
					<div class="pblock-space" aria-hidden="true"></div>
				{:else}
					<hr class="pblock-sep" />
				{/if}
			{/if}
		{/each}
	</div>

	{#if children}{@render children()}{/if}
</article>
