<script>
	/* Loading placeholder sized like the content it stands in for (no layout shift). */
	let { width = "100%", height = "0.875rem", radius = "" } = $props();
</script>

<span class="skeleton" style:width style:height style:border-radius={radius || undefined} aria-hidden="true"></span>
