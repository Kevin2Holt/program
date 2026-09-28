<script>
	import CodeField from "$lib/components/app/CodeField.svelte";
	import Topbar from "$lib/components/app/Topbar.svelte";
	import Badge from "$lib/components/ui/Badge.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Dialog from "$lib/components/ui/Dialog.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import Field from "$lib/components/ui/Field.svelte";
	import Form from "$lib/components/ui/Form.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import Segmented from "$lib/components/ui/Segmented.svelte";
	import { LIMITS } from "$lib/validation.js";

	const RELATIVE_TIME = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
	const MS_PER_MINUTE = 60 * 1000;
	const MINUTES_PER_HOUR = 60;
	const HOURS_PER_DAY = 24;
	const DAYS_SHOWN_AS_RELATIVE = 7;

	let { data, form } = $props();

	let createResult = $derived(/** @type {any} */ (form)?.create);
	let createOpen = $state(false);
	let filter = $state("active");
	let query = $state("");
	let newName = $state("");
	let newCode = $state("");
	let codeTouched = $state(false);

	let visibleEvents = $derived(data.memberEvents.filter((event) => (filter === "archived" ? event.archived : !event.archived)
		&& `${event.name} ${event.code}`.toLowerCase().includes(query.trim().toLowerCase())));
	let archivedCount = $derived(data.memberEvents.filter((event) => event.archived).length);

	$effect(() => {
		if (createResult?.errors) {
			createOpen = true;
		}
	});


	function suggestCodeFromName(name) {

		return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, LIMITS.eventCodeMax).replace(/-+$/, "");
	}

	function formatEdited(isoTimestamp) {

		const minutesAgo = Math.round((Date.now() - new Date(isoTimestamp).getTime()) / MS_PER_MINUTE);
		if (minutesAgo < MINUTES_PER_HOUR) {
			return RELATIVE_TIME.format(-Math.max(minutesAgo, 1), "minute");
		}
		const hoursAgo = Math.round(minutesAgo / MINUTES_PER_HOUR);
		if (hoursAgo < HOURS_PER_DAY) {
			return RELATIVE_TIME.format(-hoursAgo, "hour");
		}
		const daysAgo = Math.round(hoursAgo / HOURS_PER_DAY);
		if (daysAgo < DAYS_SHOWN_AS_RELATIVE) {
			return RELATIVE_TIME.format(-daysAgo, "day");
		}
		return new Date(isoTimestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
	}

	function openCreate() {

		newName = "";
		newCode = "";
		codeTouched = false;
		createOpen = true;
	}
</script>

<svelte:head><title>Events · progr.am</title></svelte:head>

<Topbar crumbs={[{ label: "Events" }]} />

<div class="content">
	<div class="page-head">
		<div>
			<h1 class="page-head__title">Events</h1>
			<p class="page-head__sub">Programs and signup calendars you manage.</p>
		</div>
		{#if data.memberEvents.length}
			<Button variant="primary" icon="plus" onclick={openCreate}>New event</Button>
		{/if}
	</div>

	{#if !data.memberEvents.length}
		<EmptyState icon="sparkle" title="Create your first event" text="An event gets a short link like {data.publicHost}/your-code. Add a program, a signup calendar, or both.">
			<Button variant="primary" icon="plus" onclick={openCreate}>New event</Button>
		</EmptyState>
	{:else}
		<div class="toolbar">
			<div class="input-affix">
				<Icon name="search" class="input-affix__icon" />
				<input class="input" type="search" placeholder="Search events" aria-label="Search events" bind:value={query} />
			</div>
			<Segmented bind:value={filter} label="Show" options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived", count: archivedCount }]} />
		</div>

		{#if visibleEvents.length}
			<div class="card event-list">
				{#each visibleEvents as event (event.id)}
					<a class="event-row" href="/events/{event.id}/program">
						<div style="min-width: 0">
							<div class="event-row__name">{event.name}</div>
							<div class="event-row__code">{data.publicHost}/{event.code}</div>
						</div>
						<div class="event-row__meta event-row__meta--hide-sm">
							{#if event.archived}<span><Badge tone="outline">Archived</Badge></span>{/if}
						</div>
						<div class="event-row__meta event-row__meta--hide-sm">
							<span class="subtle">Edited {formatEdited(event.updatedAt)}</span>
						</div>
						<Icon name="chev-right" class="subtle" />
					</a>
				{/each}
			</div>
		{:else}
			<EmptyState icon="search" title="No events match" text={filter === "archived" ? "You have no archived events." : "Try a different search."} />
		{/if}
	{/if}
</div>

<Dialog bind:open={createOpen} labelledBy="new-event-title">
	<Form action="?/create">
		{#snippet children({ pending })}
			<div class="dialog__body stack" style="--stack-gap: var(--space-4)">
				<h2 class="dialog__title" id="new-event-title">New event</h2>
				<Field id="new-name" label="Event name" error={createResult?.errors?.name}>
					{#snippet children({ id, describedBy, invalid })}
						<Input
							{id}
							name="name"
							maxlength={LIMITS.eventNameMax}
							bind:value={newName}
							{describedBy}
							{invalid}
							data-autofocus
							oninput={() => {
								if (!codeTouched) {
									newCode = suggestCodeFromName(newName);
								}
							}}
						/>
					{/snippet}
				</Field>
				<CodeField
					bind:value={newCode}
					publicHost={data.publicHost}
					id="new-code"
					error={createResult?.errors?.code}
					onuserinput={() => {
						codeTouched = true;
					}}
				/>
				<p class="hint">You can change the link later; the old one keeps working.</p>
			</div>
			<div class="dialog__foot">
				<Button variant="ghost" onclick={() => (createOpen = false)}>Cancel</Button>
				<Button type="submit" variant="primary" loading={pending}>Create event</Button>
			</div>
		{/snippet}
	</Form>
</Dialog>
