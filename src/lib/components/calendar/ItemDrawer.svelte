<script>
	/* Create or edit an Item: name, capacity, identity, and (timed calendars) its times. */
	import { page } from "$app/state";
	import Button from "../ui/Button.svelte";
	import DatePicker from "../ui/DatePicker.svelte";
	import Dialog from "../ui/Dialog.svelte";
	import Field from "../ui/Field.svelte";
	import Icon from "../ui/Icon.svelte";
	import Input from "../ui/Input.svelte";
	import ItemMarker from "../ui/ItemMarker.svelte";
	import NumberStepper from "../ui/NumberStepper.svelte";
	import TimeInput from "../ui/TimeInput.svelte";
	import IdentityPicker from "./IdentityPicker.svelte";
	import { sendJson } from "$lib/api.js";
	import { LIMITS } from "$lib/validation.js";

	const CAPACITY_MAX = 10000;
	const DEFAULT_DURATION_MIN = 60;

	let { open = $bindable(false), item = null, defaults, timed, eventId, todayDate, onsaved } = $props();

	let form = $state(buildForm());
	let errors = $state(/** @type {Record<string, string>} */ ({}));
	let saving = $state(false);

	$effect(() => {
		if (open) {
			form = buildForm();
			errors = {};
		}
	});


	function buildForm() {

		const source = item || { name: "", capacity: 1, ...defaults, times: [] };
		return {
			name: source.name,
			capacity: source.capacity,
			color: source.color,
			shape: source.shape,
			glyph: source.glyph,
			times: source.times.map((time) => ({ ...time, capacityOverride: time.capacityOverride ?? "" }))
		};
	}

	function addTime() {

		const last = form.times.at(-1);
		form.times.push({ id: null, startTime: last ? "" : "09:00", durationMinutes: last?.durationMinutes || DEFAULT_DURATION_MIN, label: "", capacityOverride: "", onlyDate: null });
	}

	async function saveItem() {

		saving = true;
		const payload = { item: $state.snapshot(form) };
		const result = item
			? await sendJson("PUT", `/api/events/${eventId}/calendar/items/${item.id}`, page.data.csrfToken, payload)
			: await sendJson("POST", `/api/events/${eventId}/calendar/items`, page.data.csrfToken, payload);
		saving = false;
		if (!result.ok) {
			errors = result.errors || {};
			return;
		}
		open = false;
		onsaved(item ? "Item saved" : "Item added");
	}
</script>

<Dialog bind:open variant="drawer" size={timed ? "wide" : "md"} labelledBy="item-drawer-title">
	<form
		class="drawer-form"
		novalidate
		onsubmit={(event) => {
			event.preventDefault();
			saveItem();
		}}
	>
		<div class="drawer__head">
			<h2 class="dialog__title" id="item-drawer-title">{item ? "Edit item" : "New item"}</h2>
			<Button variant="ghost" icon="x" label="Close" onclick={() => (open = false)} />
		</div>
		<div class="drawer__body stack" style="--stack-gap: var(--space-5)">
			<div class="item-preview">
				<ItemMarker color={form.color} shape={form.shape} glyph={form.glyph} size="xl" />
				<div>
					<div style="font-weight: var(--weight-semibold)">{form.name || "New item"}</div>
					<div class="subtle" style="font-size: var(--text-xs)">How it appears on the calendar</div>
				</div>
			</div>

			<Field id="item-name" label="Name" error={errors.name}>
				{#snippet children({ id, describedBy, invalid })}
					<Input {id} bind:value={form.name} maxlength={LIMITS.itemNameMax} placeholder="e.g. Elders Ramos & Chen" {describedBy} {invalid} data-autofocus />
				{/snippet}
			</Field>

			<Field id="item-capacity" label="Capacity" error={errors.capacity} hint={timed && form.times.length ? "Signups per time (a time can override it)." : "Signups per day."}>
				{#snippet children({ id, describedBy, invalid })}
					<NumberStepper {id} bind:value={form.capacity} min={1} max={CAPACITY_MAX} label="capacity" {describedBy} {invalid} />
				{/snippet}
			</Field>

			<IdentityPicker bind:color={form.color} bind:shape={form.shape} bind:glyph={form.glyph} />
			{#if errors.shape}<span class="error-msg"><Icon name="alert-circle" />{errors.shape}</span>{/if}

			{#if timed}
				<div class="field">
					<div class="row row--between">
						<span class="label" id="times-label">Times</span>
						<Button size="sm" icon="plus" onclick={addTime}>Add time</Button>
					</div>
					{#if form.times.length}
						<div class="card times-list" role="group" aria-labelledby="times-label">
							{#each form.times as time, index (index)}
								<div class="time-row">
									<div class="field">
										<span class="label label--small" id="time-{index}-start">Starts</span>
										<TimeInput bind:value={time.startTime} label="Start time {index + 1}" invalid={Boolean(errors[`times.${index}.startTime`])} />
									</div>
									<div class="field">
										<label class="label label--small" for="time-{index}-duration">Minutes</label>
										<input id="time-{index}-duration" class="input tabular" style="width: 5rem" inputmode="numeric" bind:value={time.durationMinutes} aria-invalid={Boolean(errors[`times.${index}.durationMinutes`]) || undefined} />
									</div>
									<div class="field">
										<label class="label label--small" for="time-{index}-cap">Capacity</label>
										<input id="time-{index}-cap" class="input tabular" style="width: 5rem" inputmode="numeric" placeholder={String(form.capacity)} bind:value={time.capacityOverride} />
									</div>
									<div class="field time-row__date">
										<span class="label label--small" id="time-{index}-date">Only on</span>
										<DatePicker bind:value={time.onlyDate} labelledBy="time-{index}-date" placeholder="Every open day" clearable {todayDate} />
									</div>
									<div class="field time-row__label">
										<label class="label label--small" for="time-{index}-label">Label <span class="label__opt">(optional)</span></label>
										<input id="time-{index}-label" class="input" maxlength="80" placeholder="e.g. Room 204" bind:value={time.label} />
									</div>
									<Button variant="ghost" size="sm" icon="x" label="Remove time {index + 1}" class="time-row__remove" onclick={() => form.times.splice(index, 1)} />
									{#each ["startTime", "durationMinutes", "capacityOverride", "onlyDate"] as key (key)}
										{#if errors[`times.${index}.${key}`]}<span class="error-msg time-row__error"><Icon name="alert-circle" />{errors[`times.${index}.${key}`]}</span>{/if}
									{/each}
								</div>
							{/each}
						</div>
					{:else}
						<p class="hint">No times yet: this Item is booked for the whole day. Add times to let people pick one.</p>
					{/if}
				</div>
			{/if}
		</div>
		<div class="drawer__foot">
			<Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
			<Button type="submit" variant="primary" loading={saving}>{item ? "Save item" : "Add item"}</Button>
		</div>
	</form>
</Dialog>
