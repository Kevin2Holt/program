<script>
	import { invalidateAll } from "$app/navigation";
	import { page } from "$app/state";
	import Topbar from "$lib/components/app/Topbar.svelte";
	import ItemDrawer from "$lib/components/calendar/ItemDrawer.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import ItemMarker from "$lib/components/ui/ItemMarker.svelte";
	import Menu from "$lib/components/ui/Menu.svelte";
	import { confirmAction } from "$lib/components/ui/confirm.svelte.js";
	import { showErrorToast, showToast } from "$lib/components/ui/toast.svelte.js";
	import { sendJson } from "$lib/api.js";
	import { formatDateShort } from "$lib/dates.js";
	import { formatTime12 } from "$lib/times.js";

	let { data } = $props();

	let drawerOpen = $state(false);
	let editingItem = $state(null);
	let showArchived = $state(false);

	let activeItems = $derived(data.items.filter((item) => !item.archived));
	let archivedItems = $derived(data.items.filter((item) => item.archived));


	function describeTimes(item) {

		if (!item.times.length) {
			return data.timed ? "All day" : "";
		}
		return item.times.map((time) => `${formatTime12(time.startTime)}${time.onlyDate ? ` (${formatDateShort(time.onlyDate)})` : ""}`).join(", ");
	}

	function openDrawer(item = null) {

		editingItem = item;
		drawerOpen = true;
	}

	async function runItemAction(item, body, successMessage, undoBody = null) {

		const result = await sendJson("POST", `/api/events/${data.event.id}/calendar/items/${item.id}`, page.data.csrfToken, body);
		if (!result.ok) {
			showErrorToast(result.message);
			return;
		}
		await invalidateAll();
		if (successMessage) {
			showToast(successMessage, undoBody ? { icon: "archive", actionLabel: "Undo", onAction: () => runItemAction(item, undoBody, "Item restored") } : { icon: "archive" });
		}
	}

	async function archiveItem(item) {

		const confirmed = await confirmAction({
			title: `Archive ${item.name}?`,
			message: `It stops appearing on the public calendar.${item.upcomingCount ? ` Its ${item.upcomingCount} upcoming signups stay, and you can still see and export them.` : ""} You can restore it any time.`,
			confirmLabel: "Archive",
			tone: "warning",
			icon: "archive"
		});
		if (confirmed) {
			runItemAction(item, { action: "archive" }, "Item archived", { action: "restore" });
		}
	}
</script>

<svelte:head><title>Items · {data.event.name}</title></svelte:head>

<Topbar crumbs={[{ label: data.event.name, href: `/events/${data.event.id}/program` }, { label: "Calendar", href: `/events/${data.event.id}/calendar` }, { label: "Items" }]} />

<div class="content" style="max-width: 60rem">
	<div class="page-head">
		<div>
			<h1 class="page-head__title">Items</h1>
			<p class="page-head__sub">What people sign up for{data.timed ? ", and when" : ""}.</p>
		</div>
		{#if activeItems.length}
			<Button variant="primary" icon="plus" onclick={() => openDrawer()}>Add item</Button>
		{/if}
	</div>

	{#if !activeItems.length}
		<EmptyState icon="shapes" title="Add the first Item" text="An Item is one thing people can sign up for, like a companionship to feed or a session to attend. Each gets its own color and shape.">
			<Button variant="primary" icon="plus" onclick={() => openDrawer()}>Add item</Button>
		</EmptyState>
	{:else}
		<div class="card item-list">
			{#each activeItems as item, index (item.id)}
				<div class="item-row">
					<ItemMarker color={item.color} shape={item.shape} glyph={item.glyph} size="lg" />
					<div style="min-width: 0">
						<button class="link-button item-row__name" type="button" onclick={() => openDrawer(item)}>{item.name}</button>
						{#if describeTimes(item)}<div class="subtle item-row__times">{describeTimes(item)}</div>{/if}
					</div>
					<span class="item-row__hide-sm muted tabular">{item.capacity} per {data.timed && item.times.length ? "time" : "day"}</span>
					<span class="item-row__hide-sm muted tabular">{item.upcomingCount} upcoming</span>
					<Menu
						label="Actions for {item.name}"
						items={[
							{ label: "Edit", icon: "pencil", onselect: () => openDrawer(item) },
							{ label: "Move up", icon: "chev-up", disabled: index === 0, onselect: () => runItemAction(item, { action: "move", direction: "up" }, "") },
							{ label: "Move down", icon: "chev-down", disabled: index === activeItems.length - 1, onselect: () => runItemAction(item, { action: "move", direction: "down" }, "") },
							{ label: "Archive", icon: "archive", danger: true, onselect: () => archiveItem(item) }
						]}
					/>
				</div>
			{/each}
		</div>
	{/if}

	{#if archivedItems.length}
		<button class="disclosure" type="button" aria-expanded={showArchived} aria-controls="archived-items" style="margin: var(--space-4) 0 var(--space-2)" onclick={() => (showArchived = !showArchived)}>
			<Icon name="chev-right" />Archived ({archivedItems.length})
		</button>
		{#if showArchived}
			<div class="card item-list" id="archived-items">
				{#each archivedItems as item (item.id)}
					<div class="item-row is-archived">
						<ItemMarker color={item.color} shape={item.shape} glyph={item.glyph} size="lg" />
						<div><div class="item-row__name">{item.name}</div><div class="item-row__times">Archived · bookings kept</div></div>
						<span class="item-row__hide-sm tabular">{item.capacity} per day</span>
						<span class="item-row__hide-sm tabular">{item.upcomingCount} upcoming</span>
						<Button size="sm" icon="undo" onclick={() => runItemAction(item, { action: "restore" }, "Item restored")}>Restore</Button>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<ItemDrawer
	bind:open={drawerOpen}
	item={editingItem}
	defaults={data.newItemDefaults}
	timed={data.timed}
	eventId={data.event.id}
	todayDate={data.today}
	onsaved={async (message) => {
		await invalidateAll();
		showToast(message);
	}}
/>
