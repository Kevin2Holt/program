<script>
	/*
		Create or edit an availability rule. Only the fields for the chosen kind
		and frequency are shown. "Applies to" follows the checkboxes:
		all checked or none checked -> All Items; some checked -> Selected Items.
	*/
	import { page } from "$app/state";
	import Button from "../ui/Button.svelte";
	import Checkbox from "../ui/Checkbox.svelte";
	import DatePicker from "../ui/DatePicker.svelte";
	import Dialog from "../ui/Dialog.svelte";
	import Icon from "../ui/Icon.svelte";
	import ItemMarker from "../ui/ItemMarker.svelte";
	import Segmented from "../ui/Segmented.svelte";
	import Select from "../ui/Select.svelte";
	import Switch from "../ui/Switch.svelte";
	import WeekdayPicker from "../ui/WeekdayPicker.svelte";
	import { sendJson } from "$lib/api.js";
	import { describeRuleTitle } from "$lib/calendar/describeRule.js";
	import { FREQUENCY, LAST_WEEK_OF_MONTH } from "$lib/calendar/recurrence.js";
	import { getWeekday } from "$lib/dates.js";
	import { LIMITS } from "$lib/validation.js";

	const FREQUENCY_OPTIONS = [
		{ value: FREQUENCY.daily, label: "Daily" },
		{ value: FREQUENCY.weekly, label: "Weekly" },
		{ value: FREQUENCY.biweekly, label: "Every 2 weeks" },
		{ value: FREQUENCY.monthlyDate, label: "Monthly on a date" },
		{ value: FREQUENCY.monthlyWeekday, label: "Monthly on a weekday" }
	];
	const WEEK_OPTIONS = [
		{ value: 1, label: "First" }, { value: 2, label: "Second" }, { value: 3, label: "Third" }, { value: 4, label: "Fourth" }, { value: LAST_WEEK_OF_MONTH, label: "Last" }
	];
	const WEEKDAY_OPTIONS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((label, value) => ({ value, label }));
	const DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => ({ value: index + 1, label: String(index + 1) }));

	let { open = $bindable(false), rule = null, items, eventId, todayDate, onsaved } = $props();

	let form = $state(buildForm());
	let errors = $state(/** @type {Record<string, string>} */ ({}));
	let saving = $state(false);
	let checkedCount = $derived(form.itemIds.length);

	$effect(() => {
		if (open) {
			form = buildForm();
			errors = {};
		}
	});


	function buildForm() {

		const source = rule || {
			effect: "block",
			kind: "recurring",
			onceDate: todayDate,
			frequency: FREQUENCY.weekly,
			weekdays: [getWeekday(todayDate)],
			monthDay: Number(todayDate.slice(8)),
			monthWeek: 1,
			monthWeekday: getWeekday(todayDate),
			startsOn: null,
			endsOn: null,
			appliesTo: "all",
			itemIds: [],
			label: "",
			active: true
		};
		return {
			...structuredClone(source),
			onceDate: source.onceDate || todayDate,
			monthDay: source.monthDay || Number(todayDate.slice(8)),
			monthWeek: source.monthWeek || 1,
			monthWeekday: source.monthWeekday ?? getWeekday(todayDate),
			weekdays: source.weekdays?.length ? [...source.weekdays] : [getWeekday(todayDate)],
			itemIds: source.appliesTo === "all" ? items.map((item) => item.id) : [...source.itemIds]
		};
	}

	function syncAppliesToFromChecks() {

		const count = form.itemIds.length;
		form.appliesTo = count > 0 && count < items.length ? "selected" : "all";
	}

	function toggleItem(itemId, checked) {

		form.itemIds = checked ? [...form.itemIds, itemId] : form.itemIds.filter((existing) => existing !== itemId);
		syncAppliesToFromChecks();
	}

	function chooseAppliesTo(value) {

		if (value === "all") {
			form.itemIds = items.map((item) => item.id);
			form.appliesTo = "all";
		}
		else {
			// Start from nothing checked; the choice then follows the checkboxes.
			form.itemIds = [];
			form.appliesTo = "selected";
		}
	}

	function describeAppliesTo() {

		if (form.appliesTo === "all") {
			return "for all items";
		}
		const names = items.filter((item) => form.itemIds.includes(item.id)).map((item) => item.name);
		return names.length ? `for ${names.join(", ")}` : "(check the items it applies to)";
	}

	async function saveRule() {

		saving = true;
		const payload = { rule: { ...$state.snapshot(form), itemIds: form.appliesTo === "all" ? [] : $state.snapshot(form.itemIds) } };
		const result = rule
			? await sendJson("PUT", `/api/events/${eventId}/calendar/rules/${rule.id}`, page.data.csrfToken, payload)
			: await sendJson("POST", `/api/events/${eventId}/calendar/rules`, page.data.csrfToken, payload);
		saving = false;
		if (!result.ok) {
			errors = result.errors || {};
			return;
		}
		open = false;
		onsaved(rule ? "Rule saved" : "Rule added");
	}
</script>

<Dialog bind:open variant="drawer" labelledBy="rule-drawer-title">
	<form
		class="drawer-form"
		novalidate
		onsubmit={(event) => {
			event.preventDefault();
			saveRule();
		}}
	>
		<div class="drawer__head">
			<h2 class="dialog__title" id="rule-drawer-title">{rule ? "Edit rule" : "New rule"}</h2>
			<Button variant="ghost" icon="x" label="Close" onclick={() => (open = false)} />
		</div>
		<div class="drawer__body stack" style="--stack-gap: var(--space-5)">
			<div class="field">
				<span class="label" id="rule-effect">Rule</span>
				<Segmented bind:value={form.effect} labelledBy="rule-effect" block options={[{ value: "allow", label: "Allow", icon: "shield-check" }, { value: "block", label: "Block", icon: "ban" }]} />
				{#if form.effect === "allow" && form.kind === "recurring"}
					<span class="hint">Items with a repeating Allow rule are only open on the days it matches (between its start and end dates).</span>
				{/if}
			</div>

			<div class="field">
				<span class="label" id="rule-kind">When</span>
				<Segmented bind:value={form.kind} labelledBy="rule-kind" block options={[{ value: "once", label: "One date" }, { value: "recurring", label: "Repeats" }]} />
			</div>

			{#if form.kind === "once"}
				<div class="field" class:has-error={errors.onceDate}>
					<span class="label" id="rule-once">Date</span>
					<DatePicker bind:value={form.onceDate} labelledBy="rule-once" {todayDate} invalid={Boolean(errors.onceDate)} />
					{#if errors.onceDate}<span class="error-msg"><Icon name="alert-circle" />{errors.onceDate}</span>{/if}
				</div>
			{:else}
				<div class="field">
					<span class="label" id="rule-frequency">Repeats</span>
					<Select bind:value={form.frequency} labelledBy="rule-frequency" options={FREQUENCY_OPTIONS} />
				</div>

				{#if form.frequency === FREQUENCY.weekly || form.frequency === FREQUENCY.biweekly}
					<div class="field" class:has-error={errors.weekdays}>
						<span class="label" id="rule-weekdays">On</span>
						<WeekdayPicker bind:value={form.weekdays} labelledBy="rule-weekdays" />
						{#if errors.weekdays}<span class="error-msg"><Icon name="alert-circle" />{errors.weekdays}</span>{/if}
					</div>
				{:else if form.frequency === FREQUENCY.monthlyDate}
					<div class="field">
						<span class="label" id="rule-monthday">On day</span>
						<div class="row">
							<div style="width: 6rem"><Select bind:value={form.monthDay} labelledBy="rule-monthday" options={DAY_OPTIONS} /></div>
							<span class="hint">of each month (skipped in months without that day)</span>
						</div>
					</div>
				{:else if form.frequency === FREQUENCY.monthlyWeekday}
					<div class="field" class:has-error={errors.monthWeek}>
						<span class="label" id="rule-monthweek">On the</span>
						<div class="row">
							<div style="width: 8rem"><Select bind:value={form.monthWeek} label="Which week" options={WEEK_OPTIONS} /></div>
							<div style="width: 9.5rem"><Select bind:value={form.monthWeekday} label="Weekday" options={WEEKDAY_OPTIONS} /></div>
						</div>
						{#if errors.monthWeek}<span class="error-msg"><Icon name="alert-circle" />{errors.monthWeek}</span>{/if}
					</div>
				{/if}

				<div class="form-grid">
					<div class="field" class:has-error={errors.startsOn}>
						<span class="label" id="rule-starts">Starts {#if form.frequency !== FREQUENCY.biweekly}<span class="label__opt">(optional)</span>{/if}</span>
						<DatePicker bind:value={form.startsOn} labelledBy="rule-starts" placeholder="Any time" clearable {todayDate} invalid={Boolean(errors.startsOn)} />
						{#if errors.startsOn}<span class="error-msg"><Icon name="alert-circle" />{errors.startsOn}</span>{/if}
					</div>
					<div class="field" class:has-error={errors.endsOn}>
						<span class="label" id="rule-ends">Ends <span class="label__opt">(optional)</span></span>
						<DatePicker bind:value={form.endsOn} labelledBy="rule-ends" placeholder="No end" clearable align="right" {todayDate} min={form.startsOn || ""} invalid={Boolean(errors.endsOn)} />
						{#if errors.endsOn}<span class="error-msg"><Icon name="alert-circle" />{errors.endsOn}</span>{/if}
					</div>
				</div>
			{/if}

			<div class="field">
				<span class="label" id="rule-applies">Applies to</span>
				<Segmented value={form.appliesTo} labelledBy="rule-applies" block options={[{ value: "all", label: "All Items" }, { value: "selected", label: "Selected Items" }]} onchange={chooseAppliesTo} />
				{#if items.length}
					<div class="card" style="margin-top: var(--space-1)">
						<div class="stack" style="--stack-gap: var(--space-2); padding: var(--space-3)">
							{#each items as item (item.id)}
								<Checkbox checked={form.itemIds.includes(item.id)} onchange={(checked) => toggleItem(item.id, checked)}>
									<span class="item-chip"><ItemMarker color={item.color} shape={item.shape} glyph={item.glyph} />{item.name}</span>
								</Checkbox>
							{/each}
						</div>
					</div>
				{/if}
				<span class="hint">
					{#if form.appliesTo === "all"}Includes Items you add later.{:else if checkedCount}Applies to {checkedCount} of {items.length} items only.{:else}Check the items this rule applies to. With none checked it applies to all items.{/if}
				</span>
			</div>

			<div class="field">
				<label class="label" for="rule-label">Label <span class="label__opt">(optional)</span></label>
				<input id="rule-label" class="input" maxlength={LIMITS.ruleLabelMax} placeholder="e.g. Zone conference" bind:value={form.label} />
			</div>

			<div class="alert rule-summary" aria-live="polite">
				<Icon name="info" />
				<div><strong>{describeRuleTitle(form)}</strong> {describeAppliesTo()}.</div>
			</div>
		</div>
		<div class="drawer__foot">
			<div style="margin-right: auto"><Switch bind:checked={form.active} label="Active" /></div>
			<Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
			<Button type="submit" variant="primary" loading={saving}>{rule ? "Save rule" : "Add rule"}</Button>
		</div>
	</form>
</Dialog>
