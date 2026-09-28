<script>
	/* Small label pill. tone: neutral | accent | success | warning | danger | outline */
	let { tone = "neutral", children } = $props();
</script>

<span class="badge" class:badge--accent={tone === "accent"} class:badge--success={tone === "success"} class:badge--warning={tone === "warning"} class:badge--danger={tone === "danger"} class:badge--outline={tone === "outline"}>
	{@render children()}
</span>
