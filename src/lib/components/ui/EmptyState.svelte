<script>
	/* Empty, error, and permission-denied states share this layout. */
	import Icon from "./Icon.svelte";

	let { icon = "sparkle", title, text = "", solid = false, children = undefined } = $props();
</script>

<div class="empty" style:border-style={solid ? "solid" : undefined}>
	<div class="empty__icon"><Icon name={icon} /></div>
	<div class="empty__title">{title}</div>
	{#if text}<p class="empty__text">{text}</p>{/if}
	{#if children}<div class="row row--wrap" style="justify-content: center; margin-top: var(--space-2)">{@render children()}</div>{/if}
</div>
