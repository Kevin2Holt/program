<script>
	import { invalidateAll } from "$app/navigation";
	import { page } from "$app/state";
	import Topbar from "$lib/components/app/Topbar.svelte";
	import BookingEditDrawer from "$lib/components/calendar/BookingEditDrawer.svelte";
	import Badge from "$lib/components/ui/Badge.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import ItemMarker from "$lib/components/ui/ItemMarker.svelte";
	import Status from "$lib/components/ui/Status.svelte";
	import { confirmAction } from "$lib/components/ui/confirm.svelte.js";
	import { showErrorToast, showToast } from "$lib/components/ui/toast.svelte.js";
	import { sendJson } from "$lib/api.js";
	import { formatDateMedium } from "$lib/dates.js";
	import { formatTimeRange } from "$lib/times.js";

	const CONTACT_LABELS = { call: "Call", text: "Text" };
	const NUMBER_LABELS = { cell: "Cell", whatsapp: "WhatsApp" };
	const ACTION_LABELS = { created: "Signed up", edited: "Edited", canceled: "Canceled", restored: "Restored" };
	/** @type {Intl.DateTimeFormatOptions} */
	const TIMESTAMP_FORMAT = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };

	let { data } = $props();

	let editOpen = $state(false);
	let booking = $derived(data.details.booking);
	let itemsById = $derived(Object.fromEntries(data.items.map((item) => [item.id, item])));
	let upcomingCount = $derived(data.details.selections.filter((selection) => selection.date >= data.today).length);


	function formatTimestamp(value) {

		return new Date(value).toLocaleString("en-US", TIMESTAMP_FORMAT);
	}

	function describeLogEntry(entry) {

		const parts = [];
		if (entry.detail?.added?.length) {
			parts.push(`added ${entry.detail.added.join("; ")}`);
		}
		if (entry.detail?.removed?.length) {
			parts.push(`removed ${entry.detail.removed.join("; ")}`);
		}
		if (entry.detail?.fields?.length) {
			parts.push(`changed ${entry.detail.fields.join(", ")}`);
		}
		return parts.join(" · ");
	}

	async function runAction(action) {

		const result = await sendJson("POST", `/api/events/${data.event.id}/calendar/bookings/${booking.id}`, page.data.csrfToken, { action });
		if (!result.ok) {
			showErrorToast(result.message);
			return;
		}
		await invalidateAll();
		if (action === "cancel") {
			showToast("Booking canceled", { icon: "x", actionLabel: "Undo", onAction: () => runAction("restore") });
		}
		else {
			showToast("Booking restored", { icon: "undo" });
		}
	}

	async function confirmCancel() {

		const confirmed = await confirmAction({
			title: "Cancel this booking?",
			message: `${booking.name}'s ${upcomingCount ? `${upcomingCount} upcoming ${upcomingCount === 1 ? "signup opens" : "signups open"} up for others` : "signups are released"}. The booking stays in your records as canceled.`,
			confirmLabel: "Cancel booking",
			cancelLabel: "Keep booking",
			icon: "alert-triangle"
		});
		if (confirmed) {
			runAction("cancel");
		}
	}

	async function copyConfirmationLink() {

		try {
			await navigator.clipboard.writeText(data.confirmationUrl);
			showToast("Link copied");
		}
		catch {
			showToast("Select the link to copy it", { icon: "info" });
		}
	}
</script>

<svelte:head><title>{booking.name} · Bookings</title></svelte:head>

<Topbar crumbs={[{ label: data.event.name, href: `/events/${data.event.id}/program` }, { label: "Bookings", href: `/events/${data.event.id}/calendar/bookings` }, { label: booking.name }]} />

<div class="content" style="max-width: 60rem">
	<a class="step-back" href="/events/{data.event.id}/calendar/bookings" style="font-size: var(--text-sm)"><Icon name="arrow-left" />Bookings</a>
	<div class="page-head">
		<div>
			<h1 class="page-head__title">{booking.name}</h1>
			<p class="page-head__sub row row--wrap" style="--row-gap: var(--space-2)">
				<span>Signed up {formatTimestamp(booking.createdAt)} · {data.details.selections.length} {data.details.selections.length === 1 ? "signup" : "signups"}</span>
				{#if booking.status === "canceled"}<Badge>Canceled</Badge>{:else}<Badge tone="success">Active</Badge>{/if}
			</p>
		</div>
		{#if data.canEdit}
			<div class="row">
				{#if booking.status === "active"}
					<Button icon="pencil" onclick={() => (editOpen = true)}>Edit</Button>
					<Button variant="dangerQuiet" onclick={confirmCancel}>Cancel booking</Button>
				{:else}
					<Button icon="undo" onclick={() => runAction("restore")}>Restore booking</Button>
				{/if}
			</div>
		{/if}
	</div>

	<div class="stack" style="--stack-gap: var(--space-4)">
		<section class="card" aria-labelledby="signups-h">
			<div class="card__head">
				<h2 class="card__title" id="signups-h">Signups</h2>
				{#if data.canEdit && booking.status === "active"}<Button size="sm" icon="calendar" onclick={() => (editOpen = true)}>Reschedule</Button>{/if}
			</div>
			<div class="table-wrap" style="border: 0; border-radius: 0 0 var(--radius-lg) var(--radius-lg)">
				<table class="table">
					<thead><tr><th>Date</th><th>Item</th><th>Time</th><th><span class="sr-only">When</span></th></tr></thead>
					<tbody>
						{#each data.details.selections as selection (selection.id)}
							{@const item = itemsById[selection.itemId]}
							<tr class:is-muted={selection.date < data.today || booking.status === "canceled"}>
								<td class="tabular nowrap">{formatDateMedium(selection.date)}</td>
								<td><span class="item-chip" class:is-archived={item?.archived}><ItemMarker color={item?.color || "slate"} shape={item?.shape || "circle"} glyph={item?.glyph} />{selection.itemName}</span></td>
								<td class="tabular nowrap">{selection.startTime ? formatTimeRange(selection.startTime, selection.durationMinutes) : "All day"}{selection.timeLabel ? ` · ${selection.timeLabel}` : ""}</td>
								<td class="num">
									{#if booking.status === "canceled"}<Status status="archived" label="Canceled" />{:else if selection.date < data.today}<Status status="out" label="Past" />{:else}<Status status="available" label="Upcoming" />{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<div class="form-grid" style="--cols: 2; align-items: start">
			<section class="card" aria-labelledby="contact-h">
				<div class="card__head"><h2 class="card__title" id="contact-h">Contact</h2></div>
				<div class="card__body">
					<dl class="dl">
						<dt>Name</dt><dd>{booking.name}</dd>
						<dt>Phone</dt><dd class="tabular">{#if booking.phone}<a href="tel:{booking.phone}">{booking.phone}</a>{:else}<span class="subtle">–</span>{/if}</dd>
						<dt>Prefers</dt><dd>{CONTACT_LABELS[booking.contactMethod] || "–"}</dd>
						<dt>Number type</dt><dd>{NUMBER_LABELS[booking.numberType] || "–"}</dd>
						<dt>Email</dt><dd>{#if booking.email}<a href="mailto:{booking.email}">{booking.email}</a>{:else}<span class="subtle">–</span>{/if}</dd>
					</dl>
				</div>
			</section>
			<section class="card" aria-labelledby="notes-h">
				<div class="card__head"><h2 class="card__title" id="notes-h">Notes</h2></div>
				<div class="card__body">
					{#if booking.notes}<p style="white-space: pre-line">{booking.notes}</p>{:else}<p class="subtle">No notes.</p>{/if}
				</div>
			</section>
		</div>

		<section class="card" aria-labelledby="record-h">
			<div class="card__head"><h2 class="card__title" id="record-h">Record</h2></div>
			<div class="card__body stack">
				<dl class="dl">
					<dt>Confirmation</dt>
					<dd class="row" style="--row-gap: var(--space-2)"><a class="confirmation-link" href={data.confirmationUrl} target="_blank" rel="noopener noreferrer">{data.confirmationUrl}</a><Button variant="ghost" size="sm" icon="copy" label="Copy confirmation link" onclick={copyConfirmationLink} /></dd>
					<dt>Email sent</dt><dd>{booking.emailSentAt ? formatTimestamp(booking.emailSentAt) : "No"}</dd>
				</dl>
				<ol class="activity">
					{#each data.details.log as entry, index (index)}
						<li>
							<span class="activity__what">{ACTION_LABELS[entry.action] || entry.action}{entry.actorName ? ` by ${entry.actorName}` : ""}</span>
							<span class="subtle tabular">{formatTimestamp(entry.at)}</span>
							{#if describeLogEntry(entry)}<span class="activity__detail">{describeLogEntry(entry)}</span>{/if}
						</li>
					{/each}
				</ol>
			</div>
		</section>
	</div>
</div>

{#if data.canEdit}
	<BookingEditDrawer
		bind:open={editOpen}
		details={data.details}
		items={data.items}
		times={data.times}
		timed={data.timed}
		todayDate={data.today}
		eventId={data.event.id}
		onsaved={async () => {
			await invalidateAll();
			showToast("Booking saved");
		}}
	/>
{/if}
