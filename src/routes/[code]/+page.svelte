<script>
	import ProgramView from "$lib/components/program/ProgramView.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";

	let { data } = $props();

	let pageTitle = $derived(data.program?.header.title ? `${data.program.header.title} · ${data.publicEvent.name}` : data.publicEvent.name);
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content="Program for {data.publicEvent.name}" />
</svelte:head>

{#if data.program}
	<main>
		<ProgramView header={data.program.header} blocks={data.program.blocks}>
			{#if data.hasCalendar}
				<a class="program-cta" href="/{data.publicEvent.code}/calendar">
					<span class="program-cta__icon"><Icon name="calendar-plus" /></span>
					<span class="grow">
						<strong>{data.calendarTitle || "Sign up"}</strong><br />
						<span class="muted" style="font-size: var(--text-md)">{data.calendarOpen ? "Pick a date and sign up" : "Signups are closed"}</span>
					</span>
					<Icon name="chev-right" class="subtle" />
				</a>
			{/if}
		</ProgramView>
	</main>
{:else}
	<main class="program">
		<EmptyState icon="file" title="This program isn't available right now" text="Check back closer to the event." />
	</main>
{/if}
