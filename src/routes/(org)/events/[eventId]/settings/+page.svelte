<script>
	import CodeField from "$lib/components/app/CodeField.svelte";
	import Topbar from "$lib/components/app/Topbar.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Field from "$lib/components/ui/Field.svelte";
	import Form from "$lib/components/ui/Form.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import { confirmAction } from "$lib/components/ui/confirm.svelte.js";
	import { showToast } from "$lib/components/ui/toast.svelte.js";
	import { LIMITS } from "$lib/validation.js";

	let { data, form } = $props();

	let result = $derived(/** @type {any} */ (form));
	let name = $derived(result?.values?.name ?? data.event.name);
	let code = $derived(result?.values?.code ?? data.event.code);
	let archiveSubmitButton = $state();


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
			<p class="page-head__sub">Name and public link.</p>
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
