<script>
	/*
		Export: choose Items, dates, (timed) time of day, a detail level, and for
		the contact level which fields to include. The preview shows exactly the
		columns the file will contain; the server enforces the same rules.
	*/
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import Topbar from "$lib/components/app/Topbar.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Checkbox from "$lib/components/ui/Checkbox.svelte";
	import DatePicker from "$lib/components/ui/DatePicker.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import ItemMarker from "$lib/components/ui/ItemMarker.svelte";
	import Segmented from "$lib/components/ui/Segmented.svelte";
	import Skeleton from "$lib/components/ui/Skeleton.svelte";
	import TimeInput from "$lib/components/ui/TimeInput.svelte";
	import { showErrorToast, showToast } from "$lib/components/ui/toast.svelte.js";
	import { sendJson } from "$lib/api.js";

	const PREVIEW_DEBOUNCE_MS = 250;
	const DETAIL_OPTIONS = [
		{ value: "count", label: "Count only", hint: "How many per item and date", icon: "hash" },
		{ value: "names", label: "Names only", hint: "Who, one row each", icon: "user" },
		{ value: "count_names", label: "Count + names", hint: "Totals plus who", icon: "users" },
		{ value: "contact", label: "Names + contact", hint: "Pick the fields below", icon: "phone" }
	];
	const FIELD_OPTIONS = [
		{ value: "phone", label: "Phone" },
		{ value: "contactMethod", label: "Call or text" },
		{ value: "numberType", label: "Cell or WhatsApp" },
		{ value: "email", label: "Email" },
		{ value: "notes", label: "Notes" }
	];

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const options = $state({
		itemIds: data.items.filter((item) => !item.archived).map((item) => item.id),
		range: "upcoming",
		fromDate: data.today,
		toDate: "",
		fromTime: "",
		toTime: "",
		detail: "contact",
		fields: ["phone", "contactMethod", "numberType", "notes"]
	});
	let preview = $state(null);
	let previewError = $state("");
	let downloading = $state(false);
	let previewTimer = null;
	const detailButtons = $state([]);


	function toggleInList(list, value, checked) {

		return checked ? [...list, value] : list.filter((existing) => existing !== value);
	}

	async function refreshPreview() {

		const result = await sendJson("POST", `/api/events/${data.event.id}/calendar/export`, page.data.csrfToken, { options: $state.snapshot(options), preview: true });
		if (result.ok) {
			preview = result;
			previewError = "";
		}
		else {
			previewError = Object.values(result.errors || {})[0] || result.message;
		}
	}

	function schedulePreview() {

		clearTimeout(previewTimer);
		previewTimer = setTimeout(refreshPreview, PREVIEW_DEBOUNCE_MS);
	}

	async function downloadCsv() {

		downloading = true;
		try {
			const response = await fetch(`/api/events/${data.event.id}/calendar/export`, {
				method: "POST",
				headers: { "content-type": "application/json", "x-csrf-token": page.data.csrfToken },
				body: JSON.stringify({ options: $state.snapshot(options) })
			});
			if (!response.ok) {
				showErrorToast("Couldn't build the file. Check the options and try again.");
				return;
			}
			const filename = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") || "")?.[1] || "signups.csv";
			const url = URL.createObjectURL(await response.blob());
			const link = Object.assign(document.createElement("a"), { href: url, download: filename });
			link.click();
			URL.revokeObjectURL(url);
			showToast(`${filename} downloaded`, { icon: "download" });
		}
		finally {
			downloading = false;
		}
	}

	function moveDetail(event, index) {

		const STEP_BY_KEY = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
		const step = STEP_BY_KEY[event.key];
		if (!step) {
			return;
		}
		event.preventDefault();
		const next = (index + step + DETAIL_OPTIONS.length) % DETAIL_OPTIONS.length;
		options.detail = DETAIL_OPTIONS[next].value;
		detailButtons[next]?.focus();
	}

	$effect(() => {
		JSON.stringify(options);
		schedulePreview();
	});

	onMount(refreshPreview);
</script>

<svelte:head><title>Export · {data.event.name}</title></svelte:head>

<Topbar crumbs={[{ label: data.event.name, href: `/events/${data.event.id}/program` }, { label: "Calendar", href: `/events/${data.event.id}/calendar` }, { label: "Export" }]} />

<div class="content content--wide" style="max-width: 72rem">
	<div class="page-head">
		<div>
			<h1 class="page-head__title">Export</h1>
			<p class="page-head__sub">Download bookings as a CSV file. Only the details you choose are included.</p>
		</div>
	</div>

	<div class="export-layout">
		<div class="card">
			<div class="card__body stack" style="--stack-gap: var(--space-5)">
				<div class="field">
					<span class="label" id="export-items">Items</span>
					<div class="stack" style="--stack-gap: var(--space-2)" role="group" aria-labelledby="export-items">
						{#each data.items as item (item.id)}
							<Checkbox checked={options.itemIds.includes(item.id)} onchange={(checked) => (options.itemIds = toggleInList(options.itemIds, item.id, checked))}>
								<span class="item-chip" class:is-archived={item.archived}><ItemMarker color={item.color} shape={item.shape} glyph={item.glyph} />{item.name}{item.archived ? " (archived)" : ""}</span>
							</Checkbox>
						{:else}
							<p class="hint">No Items yet.</p>
						{/each}
					</div>
				</div>

				<div class="field">
					<span class="label" id="export-range">Dates</span>
					<Segmented bind:value={options.range} labelledBy="export-range" block options={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }, { value: "all", label: "All" }, { value: "custom", label: "Custom" }]} />
					{#if options.range === "custom"}
						<div class="form-grid" style="margin-top: var(--space-1)">
							<DatePicker bind:value={options.fromDate} label="From" clearable placeholder="Any start" todayDate={data.today} />
							<DatePicker bind:value={options.toDate} label="To" clearable placeholder="Any end" align="right" todayDate={data.today} min={options.fromDate} />
						</div>
					{/if}
				</div>

				{#if data.timed}
					<div class="field">
						<span class="label">Time of day <span class="label__opt">(optional)</span></span>
						<div class="row">
							<TimeInput bind:value={options.fromTime} label="From time" placeholder="Any" />
							<span class="muted">to</span>
							<TimeInput bind:value={options.toTime} label="To time" placeholder="Any" />
						</div>
						<span class="hint">Includes times that start in this range.</span>
					</div>
				{/if}

				<div class="field">
					<span class="label" id="export-detail">Detail</span>
					<div class="level-grid" role="radiogroup" aria-labelledby="export-detail">
						{#each DETAIL_OPTIONS as detail, index (detail.value)}
							<button
								bind:this={detailButtons[index]}
								class="choice-card level-card"
								type="button"
								role="radio"
								aria-checked={options.detail === detail.value}
								tabindex={options.detail === detail.value ? 0 : -1}
								onclick={() => (options.detail = detail.value)}
								onkeydown={(event) => moveDetail(event, index)}
							>
								<Icon name={detail.icon} /><span>{detail.label}<small>{detail.hint}</small></span>
							</button>
						{/each}
					</div>
				</div>

				{#if options.detail === "contact"}
					<div class="field">
						<span class="label" id="export-fields">Include</span>
						<div class="stack" style="--stack-gap: var(--space-2)" role="group" aria-labelledby="export-fields">
							{#each FIELD_OPTIONS as field (field.value)}
								<Checkbox checked={options.fields.includes(field.value)} label={field.label} onchange={(checked) => (options.fields = toggleInList(options.fields, field.value, checked))} />
							{/each}
						</div>
					</div>
				{/if}
			</div>
			<div class="card__foot" style="justify-content: space-between">
				<span class="hint tabular" aria-live="polite">{preview ? `${preview.rowCount} ${preview.rowCount === 1 ? "row" : "rows"}` : ""}</span>
				<Button variant="primary" icon="download" loading={downloading} disabled={Boolean(previewError) || !preview?.rowCount} onclick={downloadCsv}>Download CSV</Button>
			</div>
		</div>

		<section class="card" aria-labelledby="preview-h">
			<div class="card__head">
				<div><h2 class="card__title" id="preview-h">Preview</h2><p class="card__desc">First rows of the file, exactly as exported.</p></div>
			</div>
			{#if previewError}
				<div class="card__body"><p class="error-msg"><Icon name="alert-circle" />{previewError}</p></div>
			{:else if !preview}
				<div class="card__body stack" style="--stack-gap: var(--space-2)" aria-busy="true"><Skeleton /><Skeleton width="80%" /><Skeleton width="60%" /></div>
			{:else if !preview.rows.length}
				<div class="card__body"><EmptyState icon="filter" title="Nothing matches" text="No bookings match these options." /></div>
			{:else}
				<div class="table-wrap" style="border: 0; border-radius: 0 0 var(--radius-lg) var(--radius-lg)">
					<table class="table export-preview">
						<thead><tr>{#each preview.header as column, index (index)}<th>{column}</th>{/each}</tr></thead>
						<tbody>
							{#each preview.rows as row, rowIndex (rowIndex)}
								<tr>{#each row as cell, cellIndex (cellIndex)}<td>{cell}</td>{/each}</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	</div>
</div>
