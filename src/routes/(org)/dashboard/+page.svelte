<script>
	import Topbar from "$lib/components/app/Topbar.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";

	let { data } = $props();
</script>

<svelte:head><title>Events · progr.am</title></svelte:head>

<Topbar crumbs={[{ label: "Events" }]} />

<div class="content">
	<div class="page-head">
		<div>
			<h1 class="page-head__title">Events</h1>
			<p class="page-head__sub">Welcome, {data.user.displayName}.</p>
		</div>
	</div>
	<EmptyState icon="sparkle" title="Events arrive in the next milestone" text="Your account is ready. Creating events, programs, and signup calendars comes next." />
</div>
