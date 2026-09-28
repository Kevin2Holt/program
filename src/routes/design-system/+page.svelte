<script>
	import Brand from "$lib/components/app/Brand.svelte";
	import Alert from "$lib/components/ui/Alert.svelte";
	import Badge from "$lib/components/ui/Badge.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Checkbox from "$lib/components/ui/Checkbox.svelte";
	import ChoiceCards from "$lib/components/ui/ChoiceCards.svelte";
	import DatePicker from "$lib/components/ui/DatePicker.svelte";
	import Dialog from "$lib/components/ui/Dialog.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import Field from "$lib/components/ui/Field.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import ItemMarker from "$lib/components/ui/ItemMarker.svelte";
	import Menu from "$lib/components/ui/Menu.svelte";
	import NumberStepper from "$lib/components/ui/NumberStepper.svelte";
	import SaveState from "$lib/components/ui/SaveState.svelte";
	import Segmented from "$lib/components/ui/Segmented.svelte";
	import Select from "$lib/components/ui/Select.svelte";
	import Skeleton from "$lib/components/ui/Skeleton.svelte";
	import Status from "$lib/components/ui/Status.svelte";
	import Switch from "$lib/components/ui/Switch.svelte";
	import Textarea from "$lib/components/ui/Textarea.svelte";
	import ThemeToggle from "$lib/components/ui/ThemeToggle.svelte";
	import TimeInput from "$lib/components/ui/TimeInput.svelte";
	import WeekdayPicker from "$lib/components/ui/WeekdayPicker.svelte";
	import { confirmAction } from "$lib/components/ui/confirm.svelte.js";
	import { showToast } from "$lib/components/ui/toast.svelte.js";

	const ITEM_COLORS = ["red", "orange", "amber", "lime", "green", "teal", "sky", "blue", "violet", "pink", "brown", "slate"];
	const ITEM_SHAPES = ["circle", "square", "triangle", "diamond", "hexagon", "star", "glyph"];

	let { data } = $props();

	let selectValue = $state("weeks");
	let zoneValue = $state("America/Denver");
	let dateValue = $state("2026-10-04");
	let timeValue = $state("17:30");
	let stepperValue = $state(2);
	let segmentValue = $state("rolling");
	let choiceValue = $state("text");
	let weekdays = $state([1, 3]);
	let switchOn = $state(true);
	let boxChecked = $state(true);
	let drawerOpen = $state(false);
	let saveStatus = $state("saved");

	const zoneOptions = Intl.supportedValuesOf("timeZone").map((zone) => ({ value: zone, label: zone }));


	async function askToDelete() {

		if (await confirmAction({ title: "Delete this block?", message: "This can't be undone.", confirmLabel: "Delete" })) {
			showToast("Deleted", { icon: "trash", actionLabel: "Undo", onAction: () => showToast("Restored") });
		}
	}
</script>

<svelte:head><title>Design system · progr.am</title></svelte:head>

<div class="content" style="max-width: 60rem; margin: 0 auto">
	<div class="row row--between" style="margin-bottom: var(--space-5)">
		<Brand />
		<ThemeToggle initialTheme={data.theme} />
	</div>
	<h1 class="page-head__title" style="margin-bottom: var(--space-4)">Design system</h1>

	<div class="card">
		<div class="ds-demo"><div class="caps">Buttons</div>
			<div class="row row--wrap">
				<Button variant="primary" icon="plus">Primary</Button>
				<Button>Secondary</Button>
				<Button variant="ghost">Ghost</Button>
				<Button variant="danger">Danger</Button>
				<Button variant="dangerQuiet">Quiet danger</Button>
				<Button variant="primary" loading>Saving</Button>
				<Button disabled>Disabled</Button>
				<Button icon="pencil" label="Edit" />
				<Menu items={[{ label: "Edit", icon: "pencil" }, { label: "Duplicate", icon: "copy" }, { label: "Delete", icon: "trash", danger: true }]} />
			</div>
		</div>

		<div class="ds-demo"><div class="caps">Inputs</div>
			<div class="form-grid">
				<Field id="ds-text" label="Text" hint="Hint text sits under the field.">
					{#snippet children({ id, describedBy })}<Input {id} {describedBy} placeholder="Placeholder" />{/snippet}
				</Field>
				<Field id="ds-error" label="With error" error="Enter an email like name@example.com.">
					{#snippet children({ id, describedBy, invalid })}<Input {id} {describedBy} {invalid} value="not-an-email" />{/snippet}
				</Field>
				<Field id="ds-select" label="Select" group>
					{#snippet children({ labelId })}
						<Select bind:value={selectValue} labelledBy={labelId} options={[{ value: "days", label: "days" }, { value: "weeks", label: "weeks" }, { value: "months", label: "months" }]} />
					{/snippet}
				</Field>
				<Field id="ds-zone" label="Event Time Zone" group>
					{#snippet children({ labelId })}
						<Select bind:value={zoneValue} labelledBy={labelId} searchable searchPlaceholder="Search time zones" options={zoneOptions} />
					{/snippet}
				</Field>
				<Field id="ds-date" label="Date" group>
					{#snippet children({ labelId })}<DatePicker bind:value={dateValue} labelledBy={labelId} clearable todayDate="2026-09-28" />{/snippet}
				</Field>
				<Field id="ds-time" label="Time">
					{#snippet children({ id })}<TimeInput {id} bind:value={timeValue} />{/snippet}
				</Field>
				<Field id="ds-stepper" label="Capacity">
					{#snippet children({ id })}<NumberStepper {id} bind:value={stepperValue} min={1} max={99} label="capacity" />{/snippet}
				</Field>
				<Field id="ds-notes" label="Notes" optional>
					{#snippet children({ id })}<Textarea {id} placeholder="Anything else?" />{/snippet}
				</Field>
			</div>
		</div>

		<div class="ds-demo"><div class="caps">Choices</div>
			<div class="stack">
				<div class="row row--wrap" style="--row-gap: var(--space-5)">
					<Checkbox bind:checked={boxChecked} label="Checkbox" />
					<Switch bind:checked={switchOn} label="Toggle" />
					<Switch checked={false} disabled label="Disabled" />
				</div>
				<Segmented bind:value={segmentValue} label="Window" options={[{ value: "fixed", label: "Fixed dates" }, { value: "rolling", label: "Rolling window" }]} />
				<WeekdayPicker bind:value={weekdays} />
				<div style="max-width: 24rem"><ChoiceCards bind:value={choiceValue} labelledBy="" options={[{ value: "text", label: "Text", icon: "message" }, { value: "call", label: "Call", icon: "phone" }]} /></div>
			</div>
		</div>

		<div class="ds-demo"><div class="caps">Item markers</div>
			<div class="row row--wrap" style="--row-gap: var(--space-3)">
				{#each ITEM_COLORS as color, index (color)}
					<ItemMarker {color} shape={ITEM_SHAPES[index % ITEM_SHAPES.length]} glyph={String.fromCharCode(65 + index)} size="xl" />
				{/each}
			</div>
		</div>

		<div class="ds-demo"><div class="caps">Statuses</div>
			<div class="row row--wrap" style="--row-gap: var(--space-4)">
				<Status status="available" /><Status status="full" /><Status status="blocked" /><Status status="out" /><Status status="archived" />
				<Badge>Neutral</Badge><Badge tone="accent">Accent</Badge><Badge tone="success">Success</Badge><Badge tone="warning">Warning</Badge><Badge tone="danger">Danger</Badge>
			</div>
		</div>

		<div class="ds-demo"><div class="caps">Feedback</div>
			<div class="stack">
				<Alert tone="danger" title="Couldn't save">You're offline. We'll retry when you reconnect.</Alert>
				<Alert tone="info">Informational message.</Alert>
				<div class="row row--wrap">
					<Segmented bind:value={saveStatus} label="Save state" size="sm" options={[{ value: "saving", label: "Saving" }, { value: "saved", label: "Saved" }, { value: "error", label: "Error" }]} />
					<SaveState status={saveStatus} onretry={() => (saveStatus = "saving")} />
				</div>
				<div class="row row--wrap">
					<Button onclick={() => showToast("Changes saved")}>Show toast</Button>
					<Button onclick={askToDelete}>Confirm dialog</Button>
					<Button onclick={() => (drawerOpen = true)}>Open drawer</Button>
				</div>
				<div class="stack" style="--stack-gap: 6px; max-width: 20rem"><Skeleton width="70%" /><Skeleton /><Skeleton width="40%" /></div>
				<EmptyState icon="filter" title="No bookings match" text="Try clearing a filter." />
			</div>
		</div>
	</div>
</div>

<Dialog bind:open={drawerOpen} variant="drawer" labelledBy="ds-drawer-title">
	<div class="drawer__head">
		<h2 class="dialog__title" id="ds-drawer-title">Drawer</h2>
		<Button variant="ghost" icon="x" label="Close" onclick={() => (drawerOpen = false)} />
	</div>
	<div class="drawer__body stack">
		<Field id="ds-drawer-name" label="Name">
			{#snippet children({ id })}<Input {id} value="Elders Ramos & Chen" data-autofocus />{/snippet}
		</Field>
	</div>
	<div class="drawer__foot">
		<Button variant="ghost" onclick={() => (drawerOpen = false)}>Cancel</Button>
		<Button variant="primary" onclick={() => {
			drawerOpen = false;
			showToast("Saved");
		}}>Save</Button>
	</div>
</Dialog>
