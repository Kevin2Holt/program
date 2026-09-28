<script>
	/* Inline message box. tone: info | warning | danger | neutral */
	import Icon from "./Icon.svelte";

	const TONE_ICONS = { info: "info", warning: "alert-triangle", danger: "alert-circle", neutral: "info" };

	let { tone = "info", title = "", icon = "", role = undefined, children = undefined } = $props();
</script>

<div class="alert" class:alert--info={tone === "info"} class:alert--warning={tone === "warning"} class:alert--danger={tone === "danger"} {role}>
	<Icon name={icon || TONE_ICONS[tone]} />
	<div>
		{#if title}<div class="alert__title">{title}</div>{/if}
		{#if children}<div class:muted={Boolean(title)}>{@render children()}</div>{/if}
	</div>
</div>
