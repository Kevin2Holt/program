<script>
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import Topbar from "$lib/components/app/Topbar.svelte";
	import Badge from "$lib/components/ui/Badge.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import ItemMarker from "$lib/components/ui/ItemMarker.svelte";
	import Segmented from "$lib/components/ui/Segmented.svelte";
	import Select from "$lib/components/ui/Select.svelte";
	import { formatDateShort } from "$lib/dates.js";
	import { formatTime12 } from "$lib/times.js";

	const SEARCH_DEBOUNCE_MS = 300;
	const CONTACT_LABELS = { call: "Call", text: "Text" };

	let { data } = $props();

	let searchText = $derived(data.query.q || "");
	let searchTimer = null;
	let base = $derived(`/events/${data.event.id}/calendar/bookings`);
	let lastPage = $derived(Math.max(1, Math.ceil(data.listing.total / data.pageSize)));
	let filtersActive = $derived(Boolean(data.query.q || data.query.item || (data.query.when && data.query.when !== "all")));
	let itemOptions = $derived([
		{ value: "", label: "All items" },
		...Object.entries(data.itemsById).map(([id, item]) => ({ value: id, label: item.name, marker: { color: item.color, shape: item.shape, glyph: item.glyph } }))
	]);


	function applyQuery(changes) {

		// A throwaway copy used only to build the next URL; it doesn't need to be reactive.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams(page.url.searchParams);
		for (const [key, value] of Object.entries(changes)) {
			if (value) {
				params.set(key, value);
			}
			else {
				params.delete(key);
			}
		}
		if (!("page" in changes)) {
			params.delete("page");
		}
		goto(`?${params}`, { keepFocus: true, noScroll: true, replaceState: true });
	}

	function scheduleSearch(value) {

		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => applyQuery({ q: value.trim() }), SEARCH_DEBOUNCE_MS);
	}

	function describeTimes(selections) {

		const times = selections.filter((selection) => selection.startTime).map((selection) => formatTime12(selection.startTime));
		return [...new Set(times)].join(", ");
	}
</script>

<svelte:head><title>Bookings · {data.event.name}</title></svelte:head>

<Topbar crumbs={[{ label: data.event.name, href: `/events/${data.event.id}/program` }, { label: "Calendar", href: `/events/${data.event.id}/calendar` }, { label: "Bookings" }]}>
	{#snippet actions()}
		{#if data.permissions.includes("calendar.export")}
			<Button size="sm" icon="download" href="/events/{data.event.id}/calendar/export"><span>Export</span></Button>
		{/if}
	{/snippet}
</Topbar>

<div class="content content--wide">
	<div class="page-head">
		<div>
			<h1 class="page-head__title">Bookings</h1>
			<p class="page-head__sub">{data.listing.total} {data.listing.total === 1 ? "row" : "rows"}. Each row is one person's signups on one date.</p>
		</div>
	</div>

	<div class="toolbar">
		<div class="input-affix">
			<Icon name="search" class="input-affix__icon" />
			<input class="input" type="search" placeholder="Search names, phones, notes" aria-label="Search bookings" value={searchText} oninput={(event) => scheduleSearch(event.currentTarget.value)} />
		</div>
		<div style="width: 13rem">
			<Select value={data.query.item || ""} label="Filter by item" size="sm" options={itemOptions} onchange={(value) => applyQuery({ item: value })} />
		</div>
		<Segmented
			value={data.query.when || "all"}
			label="Which bookings"
			options={[{ value: "all", label: "All" }, { value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }, { value: "canceled", label: "Canceled" }]}
			onchange={(value) => applyQuery({ when: value === "all" ? "" : value })}
		/>
	</div>

	{#if data.listing.rows.length}
		<!-- A scrollable region must be keyboard-reachable (WCAG 2.1.1; axe scrollable-region-focusable). -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="table-wrap" tabindex="0" role="region" aria-label="Bookings table">
			<table class="table bookings-table">
				<thead>
					<tr>
						<th aria-sort={data.query.sort === "asc" ? "ascending" : "descending"}>
							<button type="button" onclick={() => applyQuery({ sort: data.query.sort === "asc" ? "" : "asc" })}>
								Date <Icon name={data.query.sort === "asc" ? "chev-up" : "chev-down"} />
							</button>
						</th>
						<th>Item(s)</th>
						<th>Name</th>
						<th>Phone</th>
						<th>Contact</th>
						<th>WhatsApp</th>
						<th><span class="sr-only">Notes</span><Icon name="message" /></th>
						<th><span class="sr-only">Details</span></th>
					</tr>
				</thead>
				<tbody>
					{#each data.listing.rows as row (`${row.bookingId}:${row.date}`)}
						<tr>
							<td class="nowrap tabular bookings-table__date">
								{formatDateShort(row.date)}
								{#if describeTimes(row.selections)}<div class="subtle" style="font-size: var(--text-xs)">{describeTimes(row.selections)}</div>{/if}
							</td>
							<td>
								<div class="stack" style="--stack-gap: 2px">
									{#each row.selections as selection, index (index)}
										{@const item = data.itemsById[selection.itemId]}
										<span class="item-chip"><ItemMarker color={item?.color || "slate"} shape={item?.shape || "circle"} glyph={item?.glyph} />{selection.itemName}</span>
									{/each}
								</div>
							</td>
							<td><a class="table__name" href="{base}/{row.bookingId}">{row.name}</a></td>
							<td class="nowrap tabular" data-label="Phone">{#if row.phone}<a href="tel:{row.phone}" class="table__phone">{row.phone}</a>{:else}<span class="subtle">–</span>{/if}</td>
							<td data-label="Contact">{CONTACT_LABELS[row.contactMethod] || "–"}</td>
							<td data-label="WhatsApp">{#if row.numberType === "whatsapp"}<Badge tone="success">Yes</Badge>{:else}No{/if}</td>
							<td>{#if row.hasNotes}<Icon name="message" label="Has notes" class="muted" />{/if}</td>
							<td class="num"><a class="table__link" href="{base}/{row.bookingId}" aria-label="Details for {row.name}"><Icon name="chev-right" /></a></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="pager">
			<span class="tabular">Showing {(data.listing.page - 1) * data.pageSize + 1}–{Math.min(data.listing.page * data.pageSize, data.listing.total)} of {data.listing.total}</span>
			<div class="row">
				<Button size="sm" disabled={data.listing.page <= 1} onclick={() => applyQuery({ page: String(data.listing.page - 1) })}>Previous</Button>
				<Button size="sm" disabled={data.listing.page >= lastPage} onclick={() => applyQuery({ page: String(data.listing.page + 1) })}>Next</Button>
			</div>
		</div>
	{:else if filtersActive}
		<EmptyState icon="filter" title="No bookings match" text="Try a different search or filter.">
			<Button size="sm" href={base}>Clear filters</Button>
		</EmptyState>
	{:else}
		<EmptyState icon="ticket" title="No signups yet" text="When people sign up on the public calendar, they'll appear here.">
			<Button size="sm" icon="external" href="{data.publicUrl}/calendar" target="_blank">Open the public calendar</Button>
		</EmptyState>
	{/if}
</div>
