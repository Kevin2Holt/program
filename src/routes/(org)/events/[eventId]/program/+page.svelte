<script>
	import { page } from "$app/state";
	import Topbar from "$lib/components/app/Topbar.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import { showToast } from "$lib/components/ui/toast.svelte.js";
	import { onMount } from "svelte";

	let { data } = $props();

	onMount(() => {
		if (page.url.searchParams.get("created")) {
			showToast("Event created");
		}
	});
</script>

<svelte:head><title>Program · {data.event.name}</title></svelte:head>

<Topbar crumbs={[{ label: data.event.name, href: `/events/${data.event.id}/program` }, { label: "Program" }]} />

<div class="content">
	<EmptyState icon="file" title="The program editor arrives next" text="Blocks, live preview, and publishing come in the next milestone." />
</div>
