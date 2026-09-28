<script>
	import OrganizerShell from "$lib/components/app/OrganizerShell.svelte";

	let { data, children } = $props();

	const SECTIONS = [
		{ links: [{ href: "/dashboard", label: "All events", icon: "home" }] }
	];
</script>

<OrganizerShell user={data.user} sections={SECTIONS}>
	{@render children()}
</OrganizerShell>
