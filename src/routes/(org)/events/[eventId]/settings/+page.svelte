<script>
	import CodeField from "$lib/components/app/CodeField.svelte";
	import Topbar from "$lib/components/app/Topbar.svelte";
	import { tick } from "svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import ColorSwatches from "$lib/components/ui/ColorSwatches.svelte";
	import Field from "$lib/components/ui/Field.svelte";
	import Form from "$lib/components/ui/Form.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import { confirmAction } from "$lib/components/ui/confirm.svelte.js";
	import { showToast } from "$lib/components/ui/toast.svelte.js";
	import { ACCENT_COLORS } from "$lib/accentColors.js";
	import { LIMITS } from "$lib/validation.js";

	let { data, form } = $props();

	let result = $derived(/** @type {any} */ (form));
	let name = $derived(result?.values?.name ?? data.event.name);
	let code = $derived(result?.values?.code ?? data.event.code);
	let archiveSubmitButton = $state();
	let accentSubmitButton = $state();
	// Follows the saved color, but switches the moment a swatch is picked.
	let accentColor = $derived(data.event.accentColor);


	async function saveAccent(value) {

		accentColor = value;
		await tick();
		accentSubmitButton.click();
	}

	async function toggleArchived() {

		const archiving = !data.event.archived;
		const confirmed = !archiving || await confirmAction({
			title: `Archive ${data.event.name}?`,
			message: "Its public link stops working and it moves to Archived on your dashboard. Nothing is deleted, and you can restore it any time.",
			confirmLabel: "Archive",
			tone: "warning",
			icon: "archive"
		});
		if (confirmed) {
			archiveSubmitButton.click();
		}
	}
</script>

<svelte:head><title>Event settings · {data.event.name}</title></svelte:head>

<Topbar crumbs={[{ label: data.event.name, href: `/events/${data.event.id}/program` }, { label: "Event settings" }]} />

<div class="content" style="max-width: 48rem">
	<div class="page-head">
		<div>
			<h1 class="page-head__title">Event settings</h1>
			<p class="page-head__sub">Name, public link, and color.</p>
		</div>
	</div>

	<div class="stack" style="--stack-gap: var(--space-4)">
		<section class="card" aria-labelledby="details-h">
			<div class="card__head"><h2 class="card__title" id="details-h">Details</h2></div>
			<Form action="?/save" onsuccess={() => showToast(result?.codeChanged ? "Saved. The old link now redirects." : "Settings saved")}>
				{#snippet children({ pending })}
					<div class="card__body stack" style="--stack-gap: var(--space-4)">
						<Field id="event-name" label="Event name" error={result?.errors?.name}>
							{#snippet children({ id, describedBy, invalid })}
								<Input {id} name="name" maxlength={LIMITS.eventNameMax} value={name} {describedBy} {invalid} />
							{/snippet}
						</Field>
						<CodeField value={code} publicHost={data.publicHost} eventId={data.event.id} unchangedCode={data.event.code} id="event-code" error={result?.errors?.code} />
						{#if data.oldCodes.length}
							<p class="hint">Old links that still redirect here: {#each data.oldCodes as oldCode, index (oldCode)}<span class="tabular" style="font-family: var(--font-mono)">{data.publicHost}/{oldCode}</span>{index < data.oldCodes.length - 1 ? ", " : ""}{/each}</p>
						{/if}
					</div>
					<div class="card__foot">
						<Button type="submit" variant="primary" loading={pending}>Save</Button>
					</div>
				{/snippet}
			</Form>
		</section>

		<section class="card" aria-labelledby="accent-h">
			<div class="settings-row">
				<div>
					<div class="settings-row__label" id="accent-h">Page color</div>
					<div class="settings-row__desc">Buttons, links, and highlights on this event's public pages. Every color stays readable in light and dark.</div>
				</div>
				<Form action="?/accent" onsuccess={() => showToast("Page color saved")} onfailure={() => showToast("Couldn't save the color. Try again.", { icon: "alert-circle" })}>
					<div class="stack" style="--stack-gap: var(--space-3)">
						<input type="hidden" name="accentColor" value={accentColor} />
						<button bind:this={accentSubmitButton} type="submit" hidden aria-hidden="true" tabindex="-1"></button>
						<ColorSwatches value={accentColor} options={ACCENT_COLORS} labelledBy="accent-h" onchange={saveAccent} />
						<div class="accent-preview" data-accent={accentColor} aria-hidden="true">
							<span class="btn btn--primary btn--sm">Sign up</span>
							<span class="badge badge--accent">3 open</span>
							<span style="color: var(--color-accent-text); text-decoration: underline; text-underline-offset: 0.18em">A link on the page</span>
						</div>
					</div>
				</Form>
			</div>
		</section>

		<section class="card" aria-labelledby="archive-h">
			<div class="settings-row">
				<div>
					<div class="settings-row__label" id="archive-h">{data.event.archived ? "Restore event" : "Archive event"}</div>
					<div class="settings-row__desc">{data.event.archived ? "Brings the public link back." : "Hides the event from the public. Nothing is deleted."}</div>
				</div>
				<div>
					<Form action="?/archive" onsuccess={() => showToast(data.event.archived ? "Event archived" : "Event restored", { icon: "archive" })}>
						{#snippet children({ pending })}
							<input type="hidden" name="archived" value={String(!data.event.archived)} />
							<button bind:this={archiveSubmitButton} type="submit" hidden aria-hidden="true" tabindex="-1"></button>
							<Button icon={data.event.archived ? "undo" : "archive"} loading={pending} onclick={toggleArchived}>{data.event.archived ? "Restore" : "Archive"}</Button>
						{/snippet}
					</Form>
				</div>
			</div>
		</section>
	</div>
</div>
