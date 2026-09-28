<script>
	/*
		Edit or reschedule a booking. Each signup row picks a date, an Item, and
		(for Items with times) a time. The server refuses full, blocked, or
		overlapping targets and explains which row and why.
	*/
	import { page } from "$app/state";
	import Button from "../ui/Button.svelte";
	import DatePicker from "../ui/DatePicker.svelte";
	import Dialog from "../ui/Dialog.svelte";
	import Field from "../ui/Field.svelte";
	import Icon from "../ui/Icon.svelte";
	import Input from "../ui/Input.svelte";
	import Segmented from "../ui/Segmented.svelte";
	import Select from "../ui/Select.svelte";
	import Textarea from "../ui/Textarea.svelte";
	import { sendJson } from "$lib/api.js";
	import { listItemTimesOnDate } from "$lib/calendar/availability.js";
	import { formatTimeRange } from "$lib/times.js";
	import { LIMITS } from "$lib/validation.js";

	let { open = $bindable(false), details, items, times, timed, todayDate, eventId, onsaved } = $props();

	let form = $state(buildForm());
	let errors = $state(/** @type {Record<string, any>} */ ({}));
	let rowMessages = $state({});
	let saving = $state(false);

	$effect(() => {
		if (open) {
			form = buildForm();
			errors = {};
			rowMessages = {};
		}
	});


	function buildForm() {

		const { booking, selections } = details;
		return {
			name: booking.name,
			phone: booking.phone,
			contactMethod: booking.contactMethod || "",
			numberType: booking.numberType || "",
			email: booking.email,
			notes: booking.notes,
			selections: selections.map((selection) => ({ itemId: selection.itemId, date: selection.date, timeId: selection.timeId }))
		};
	}

	function listItemOptions(currentItemId) {

		return items
			.filter((item) => !item.archived || item.id === currentItemId)
			.map((item) => ({ value: item.id, label: item.archived ? `${item.name} (archived)` : item.name, marker: { color: item.color, shape: item.shape, glyph: item.glyph } }));
	}

	function listTimeOptions(row) {

		const offered = listItemTimesOnDate(times, row.itemId, row.date);
		const current = times.find((time) => time.id === row.timeId);
		const all = current && !offered.some((time) => time.id === current.id) ? [current, ...offered] : offered;
		return all.map((time) => ({ value: time.id, label: formatTimeRange(time.startTime, time.durationMinutes), meta: time.label }));
	}

	function syncTime(row) {

		const options = timed ? listTimeOptions(row) : [];
		if (!options.length) {
			row.timeId = null;
		}
		else if (!options.some((option) => option.value === row.timeId)) {
			row.timeId = options[0].value;
		}
	}

	function addRow() {

		const activeItem = items.find((item) => !item.archived);
		const row = { itemId: activeItem?.id, date: form.selections.at(-1)?.date || todayDate, timeId: null };
		syncTime(row);
		form.selections.push(row);
	}

	async function saveBooking() {

		saving = true;
		rowMessages = {};
		const result = await sendJson("PUT", `/api/events/${eventId}/calendar/bookings/${details.booking.id}`, page.data.csrfToken, { booking: $state.snapshot(form) });
		saving = false;
		if (result.ok) {
			open = false;
			onsaved();
			return;
		}
		errors = result.errors || {};
		if (Array.isArray(errors.selections)) {
			rowMessages = Object.fromEntries(errors.selections.filter((entry) => !entry.ok).map((entry) => [entry.index, entry.message]));
		}
	}
</script>

<Dialog bind:open variant="drawer" size="wide" labelledBy="booking-edit-title">
	<form
		class="drawer-form"
		novalidate
		onsubmit={(event) => {
			event.preventDefault();
			saveBooking();
		}}
	>
		<div class="drawer__head">
			<h2 class="dialog__title" id="booking-edit-title">Edit booking</h2>
			<Button variant="ghost" icon="x" label="Close" onclick={() => (open = false)} />
		</div>
		<div class="drawer__body stack" style="--stack-gap: var(--space-5)">
			<div class="field">
				<span class="label" id="edit-signups">Signups</span>
				<div class="card" role="group" aria-labelledby="edit-signups">
					<div class="stack" style="--stack-gap: 0">
						{#each form.selections as row, index (index)}
							<div class="edit-row" class:has-error={rowMessages[index]}>
								<div class="edit-row__fields">
									<DatePicker bind:value={row.date} label="Date {index + 1}" {todayDate} onchange={() => syncTime(row)} invalid={Boolean(rowMessages[index])} />
									<Select bind:value={row.itemId} label="Item {index + 1}" options={listItemOptions(row.itemId)} onchange={() => syncTime(row)} />
									{#if timed && listTimeOptions(row).length}
										<Select bind:value={row.timeId} label="Time {index + 1}" options={listTimeOptions(row)} />
									{/if}
								</div>
								<Button variant="ghost" size="sm" icon="x" label="Remove signup {index + 1}" disabled={form.selections.length === 1} onclick={() => form.selections.splice(index, 1)} />
								{#if rowMessages[index]}<span class="error-msg edit-row__error"><Icon name="alert-circle" />{rowMessages[index]}</span>{/if}
							</div>
						{/each}
					</div>
					<div style="padding: var(--space-2) var(--space-3)">
						<Button variant="ghost" size="sm" icon="plus" onclick={addRow}>Add a signup</Button>
					</div>
				</div>
				{#if typeof errors.selections === "string"}<span class="error-msg"><Icon name="alert-circle" />{errors.selections}</span>{/if}
			</div>

			<div class="form-grid">
				<Field id="edit-name" label="Name" class="span-all" error={errors.name}>
					{#snippet children({ id, describedBy, invalid })}<Input {id} bind:value={form.name} maxlength={LIMITS.personNameMax} {describedBy} {invalid} />{/snippet}
				</Field>
				<Field id="edit-phone" label="Phone" error={errors.phone}>
					{#snippet children({ id, describedBy, invalid })}<Input {id} bind:value={form.phone} type="tel" {describedBy} {invalid} />{/snippet}
				</Field>
				<Field id="edit-email" label="Email" error={errors.email}>
					{#snippet children({ id, describedBy, invalid })}<Input {id} bind:value={form.email} type="email" {describedBy} {invalid} />{/snippet}
				</Field>
				<div class="field">
					<span class="label" id="edit-contact">Prefers</span>
					<Segmented bind:value={form.contactMethod} labelledBy="edit-contact" block options={[{ value: "", label: "—" }, { value: "text", label: "Text" }, { value: "call", label: "Call" }]} />
				</div>
				<div class="field">
					<span class="label" id="edit-number">Number type</span>
					<Segmented bind:value={form.numberType} labelledBy="edit-number" block options={[{ value: "", label: "—" }, { value: "cell", label: "Cell" }, { value: "whatsapp", label: "WhatsApp" }]} />
				</div>
				<Field id="edit-notes" label="Notes" class="span-all">
					{#snippet children({ id })}<Textarea {id} bind:value={form.notes} maxlength={LIMITS.notesMax} />{/snippet}
				</Field>
			</div>
		</div>
		<div class="drawer__foot">
			<Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
			<Button type="submit" variant="primary" loading={saving}>Save changes</Button>
		</div>
	</form>
</Dialog>
