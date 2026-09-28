<script>
	import PublicShell from "$lib/components/app/PublicShell.svelte";

	let { data, children } = $props();
</script>

<PublicShell event={data.publicEvent} hasCalendar={data.hasCalendar}>
	{@render children()}
</PublicShell>
