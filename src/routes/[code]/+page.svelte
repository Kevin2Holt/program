<script>
	import EmptyState from "$lib/components/ui/EmptyState.svelte";

	let { data } = $props();
</script>

<svelte:head><title>{data.publicEvent.name}</title></svelte:head>

<main class="program">
	<EmptyState icon="file" title="This program isn't available yet" text="Check back closer to the event." />
</main>
