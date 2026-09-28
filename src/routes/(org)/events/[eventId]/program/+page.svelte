<script>
	/*
		Program editor. Edits apply locally at once (the live preview follows) and
		autosave per block after a short pause. Structural changes (add, duplicate,
		delete, reorder) save immediately. Publishing flushes pending saves first.
	*/
	import { onMount } from "svelte";
	import { beforeNavigate, goto, invalidateAll } from "$app/navigation";
	import { page } from "$app/state";
	import Topbar from "$lib/components/app/Topbar.svelte";
	import InsertGap from "$lib/components/program/InsertGap.svelte";
	import LabelValueEditor from "$lib/components/program/LabelValueEditor.svelte";
	import ProgramView from "$lib/components/program/ProgramView.svelte";
	import TextBlockEditor from "$lib/components/program/TextBlockEditor.svelte";
	import { createSaveQueue } from "$lib/components/program/saveQueue.svelte.js";
	import Badge from "$lib/components/ui/Badge.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import Menu from "$lib/components/ui/Menu.svelte";
	import SaveState from "$lib/components/ui/SaveState.svelte";
	import Segmented from "$lib/components/ui/Segmented.svelte";
	import { confirmAction } from "$lib/components/ui/confirm.svelte.js";
	import { showErrorToast, showToast } from "$lib/components/ui/toast.svelte.js";
	import { sendJson } from "$lib/api.js";
	import { BLOCK_LIMITS, BLOCK_TYPES, BLOCK_TYPE_NAMES } from "$lib/blocks/registry.js";

	const AUTOSAVE_DEBOUNCE_MS = 600;
	const HEADER_FIELDS = [
		{ key: "eyebrow", label: "Eyebrow", placeholder: "Sacrament Meeting" },
		{ key: "title", label: "Title", placeholder: "Elm Ward" },
		{ key: "date", label: "Date", placeholder: "Sunday, October 4, 2026" },
		{ key: "time", label: "Time", placeholder: "10:00 am" },
		{ key: "place", label: "Place", placeholder: "Elm Chapel" }
	];

	let { data } = $props();

	const saves = createSaveQueue(AUTOSAVE_DEBOUNCE_MS);
	// The editor owns its state after load (it saves back as you type), so it copies data once.
	// svelte-ignore state_referenced_locally
	const header = $state({ ...data.editor.header });
	// svelte-ignore state_referenced_locally
	const blocks = $state(data.editor.blocks.map((block) => ({ ...block })));
	// svelte-ignore state_referenced_locally
	let status = $state({ ...data.editor.status });
	let focusedBlockId = $state(null);
	let previewSize = $state("phone");
	let showPreview = $state(false);
	let publishing = $state(false);
	let lifted = $state(null);
	let drag = $state(null);
	let announcement = $state("");
	let blockListEl = $state();

	let apiBase = $derived(`/api/events/${data.event.id}/program`);
	let csrfToken = $derived(page.data.csrfToken);


	/* ---------- Helpers ---------- */

	function findBlockIndex(blockId) {

		return blocks.findIndex((block) => block.id === blockId);
	}

	function markDraftChanged() {

		status.hasUnpublishedChanges = true;
	}

	function announce(message) {

		announcement = message;
	}

	function focusBlock(blockId) {

		setTimeout(() => {
			const blockEl = blockListEl?.querySelector(`[data-block-id="${blockId}"]`);
			(blockEl?.querySelector(".ProseMirror, input, button.segmented__opt") || blockEl)?.focus();
		});
	}


	/* ---------- Autosave ---------- */

	function scheduleBlockSave(blockId) {

		markDraftChanged();
		saves.schedule(`block:${blockId}`, () => {
			const block = blocks.find((existing) => existing.id === blockId);
			if (!block) {
				return Promise.resolve({ ok: true });
			}
			return sendJson("PATCH", `${apiBase}/blocks/${blockId}`, csrfToken, { content: block.content, html: block.html });
		});
	}

	function changeBlock(blockId, patch) {

		const index = findBlockIndex(blockId);
		if (index >= 0) {
			blocks[index] = { ...blocks[index], ...patch };
			scheduleBlockSave(blockId);
		}
	}

	function changeHeaderField(key, value) {

		header[key] = value;
		markDraftChanged();
		saves.schedule("header", () => sendJson("PUT", `${apiBase}/header`, csrfToken, { header: $state.snapshot(header) }));
	}

	function saveOrder() {

		markDraftChanged();
		const order = blocks.map((block) => block.id);
		saves.runNow("order", async () => {
			const result = await sendJson("PUT", `${apiBase}/order`, csrfToken, { order });
			if (!result.ok) {
				showErrorToast(result.message);
				await invalidateAll();
			}
			return result;
		});
	}


	/* ---------- Structural changes ---------- */

	async function insertBlock(type, position, restore = null) {

		const result = await sendJson("POST", `${apiBase}/blocks`, csrfToken, restore ? { type, position, content: restore.content, html: restore.html } : { type, position });
		if (!result.ok) {
			showErrorToast(result.message);
			return;
		}
		blocks.splice(Math.min(position, blocks.length), 0, result.block);
		markDraftChanged();
		focusBlock(result.block.id);
	}

	async function duplicateBlock(blockId) {

		await saves.flush();
		const result = await sendJson("POST", `${apiBase}/blocks/${blockId}/duplicate`, csrfToken);
		if (!result.ok) {
			showErrorToast(result.message);
			return;
		}
		blocks.splice(findBlockIndex(blockId) + 1, 0, result.block);
		markDraftChanged();
		showToast("Block duplicated", { icon: "copy" });
	}

	async function deleteBlock(blockId) {

		const position = findBlockIndex(blockId);
		const removed = $state.snapshot(blocks[position]);
		saves.cancel(`block:${blockId}`);
		blocks.splice(position, 1);
		const result = await sendJson("DELETE", `${apiBase}/blocks/${blockId}`, csrfToken);
		if (!result.ok) {
			blocks.splice(position, 0, removed);
			showErrorToast(result.message);
			return;
		}
		markDraftChanged();
		showToast("Block deleted", {
			icon: "trash",
			actionLabel: "Undo",
			onAction: () => insertBlock(removed.type, position, removed)
		});
	}

	function moveBlock(fromIndex, toIndex) {

		if (fromIndex === toIndex || toIndex < 0 || toIndex >= blocks.length) {
			return false;
		}
		const [moved] = blocks.splice(fromIndex, 1);
		blocks.splice(toIndex, 0, moved);
		return true;
	}


	/* ---------- Reordering: pointer drag and keyboard ---------- */

	function findDropGap(pointerY) {

		const blockEls = [...blockListEl.querySelectorAll("[data-block-id]")];
		for (let index = 0; index < blockEls.length; index += 1) {
			const rect = blockEls[index].getBoundingClientRect();
			if (pointerY < rect.top + rect.height / 2) {
				return index;
			}
		}
		return blockEls.length;
	}

	function startPointerDrag(event, blockId) {

		if (event.button !== 0) {
			return;
		}
		event.preventDefault();
		const startIndex = findBlockIndex(blockId);
		drag = { blockId, startY: event.clientY, offsetY: 0, gap: startIndex };

		function handleMove(moveEvent) {

			drag.offsetY = moveEvent.clientY - drag.startY;
			drag.gap = findDropGap(moveEvent.clientY);
		}

		function handleUp() {

			window.removeEventListener("pointermove", handleMove);
			const targetIndex = drag.gap > startIndex ? drag.gap - 1 : drag.gap;
			drag = null;
			if (moveBlock(startIndex, targetIndex)) {
				saveOrder();
			}
		}

		window.addEventListener("pointermove", handleMove);
		window.addEventListener("pointerup", handleUp, { once: true });
	}

	function handleGripKeydown(event, blockId) {

		const index = findBlockIndex(blockId);
		if (event.key === " " || event.key === "Enter") {
			event.preventDefault();
			if (lifted?.blockId === blockId) {
				lifted = null;
				announce(`Dropped at position ${index + 1} of ${blocks.length}.`);
				saveOrder();
			}
			else {
				lifted = { blockId, originalIndex: index };
				announce(`Picked up block ${index + 1} of ${blocks.length}. Use the arrow keys to move it, Space to drop, Escape to cancel.`);
			}
		}
		else if (lifted?.blockId === blockId && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
			event.preventDefault();
			const target = index + (event.key === "ArrowUp" ? -1 : 1);
			if (moveBlock(index, target)) {
				announce(`Moved to position ${target + 1} of ${blocks.length}.`);
				setTimeout(() => blockListEl.querySelector(`[data-block-id="${blockId}"] .ed-block__grip`)?.focus());
			}
		}
		else if (lifted?.blockId === blockId && event.key === "Escape") {
			event.preventDefault();
			moveBlock(index, lifted.originalIndex);
			lifted = null;
			announce("Move canceled.");
			setTimeout(() => blockListEl.querySelector(`[data-block-id="${blockId}"] .ed-block__grip`)?.focus());
		}
	}


	/* ---------- Publishing ---------- */

	async function runPublishAction(action, successMessage, icon) {

		publishing = true;
		await saves.flush();
		if (saves.state.status === "error") {
			publishing = false;
			showErrorToast("Some changes aren't saved yet. Retry saving, then publish.");
			return;
		}
		const result = await sendJson("POST", `${apiBase}/${action}`, csrfToken);
		publishing = false;
		if (!result.ok) {
			showErrorToast(result.message);
			return;
		}
		status = result.status;
		showToast(successMessage, { icon });
	}

	async function confirmUnpublish() {

		const confirmed = await confirmAction({
			title: "Unpublish the program?",
			message: `${data.publicUrl.replace(/^https?:\/\//, "")} will show "This program isn't available right now." Your draft is kept, and Roll back puts this version live again.`,
			confirmLabel: "Unpublish",
			icon: "power"
		});
		if (confirmed) {
			runPublishAction("unpublish", "Program unpublished", "power");
		}
	}

	async function confirmRollback() {

		const confirmed = await confirmAction({
			title: "Roll back to the previous version?",
			message: "The previous published version goes live again, and the current one becomes the previous version, so you can switch back. Your draft isn't changed.",
			confirmLabel: "Roll back",
			tone: "warning",
			icon: "undo"
		});
		if (confirmed) {
			runPublishAction("rollback", "Rolled back to the previous version", "undo");
		}
	}


	/* ---------- Leaving with unsaved work ---------- */

	beforeNavigate(({ cancel, to, willUnload }) => {
		if (!saves.checkHasPendingWork() || willUnload || !to) {
			return;
		}
		cancel();
		saves.flush().then(() => goto(to.url));
	});

	onMount(() => {
		if (page.url.searchParams.get("created")) {
			showToast("Event created");
			history.replaceState(history.state, "", page.url.pathname);
		}
		const warnBeforeUnload = (event) => {
			if (saves.checkHasPendingWork()) {
				event.preventDefault();
			}
		};
		window.addEventListener("beforeunload", warnBeforeUnload);
		return () => window.removeEventListener("beforeunload", warnBeforeUnload);
	});
</script>

<svelte:head><title>Program · {data.event.name}</title></svelte:head>

<Topbar crumbs={[{ label: data.event.name, href: `/events/${data.event.id}/program` }, { label: "Program" }]}>
	{#snippet actions()}
		<SaveState status={saves.state.status} onretry={saves.retryFailed} />
		{#if status.hasUnpublishedChanges && status.isPublished}
			<span class="hide-sm"><Badge tone="warning">Unpublished changes</Badge></span>
		{:else if status.isPublished}
			<span class="hide-sm"><Badge tone="success">Published</Badge></span>
		{:else}
			<span class="hide-sm"><Badge>Not published</Badge></span>
		{/if}
		<Button size="sm" icon="eye" class="preview-toggle" aria-pressed={showPreview} onclick={() => (showPreview = !showPreview)}>Preview</Button>
		{#if data.canPublish}
			<Menu
				label="More publishing actions"
				width="16rem"
				items={[
					...(status.isPublished ? [{ label: "View published page", icon: "external", href: data.publicUrl, external: true }] : []),
					...(status.hasPrevious ? [{ label: "Roll back to previous version", icon: "undo", onselect: confirmRollback }] : []),
					...(status.isPublished ? [{ label: "Unpublish", icon: "power", danger: true, onselect: confirmUnpublish }] : []),
					...(!status.isPublished && !status.hasPrevious ? [{ label: "Nothing published yet", icon: "info", disabled: true }] : [])
				]}
			/>
			<Button size="sm" variant="primary" icon="send" loading={publishing} onclick={() => runPublishAction("publish", status.isPublished ? "Published. The public page is updated." : "Published. Your program is live.", "globe")}>Publish</Button>
		{/if}
	{/snippet}
</Topbar>

<div class="sr-only" aria-live="assertive">{announcement}</div>

<div class="editor" class:show-preview={showPreview}>
	<div class="editor__canvas">
		<div class="editor__canvas-inner">
			<section class="card" style="margin-bottom: var(--space-4)" aria-label="Program header">
				<div class="card__body program-header-grid">
					{#each HEADER_FIELDS as field (field.key)}
						<div class="field program-header-grid__{field.key}">
							<label class="label" for="header-{field.key}">{field.label}</label>
							<input
								id="header-{field.key}"
								class="input"
								placeholder={field.placeholder}
								maxlength={BLOCK_LIMITS.headerFieldMax}
								value={header[field.key]}
								disabled={!data.canEdit}
								oninput={(event) => changeHeaderField(field.key, event.currentTarget.value)}
							/>
						</div>
					{/each}
				</div>
			</section>

			{#if !blocks.length}
				<div class="empty" style="margin-bottom: var(--space-3)">
					<div class="empty__icon"><Icon name="layout" /></div>
					<div class="empty__title">Start your program</div>
					<p class="empty__text">Add blocks for speakers, music, announcements, and anything else. They appear in this order on the public page.</p>
					{#if data.canEdit}
						<div class="row row--wrap" style="justify-content: center; margin-top: var(--space-2)">
							{#each BLOCK_TYPE_NAMES as type (type)}
								<Button icon={BLOCK_TYPES[type].icon} onclick={() => insertBlock(type, 0)}>{BLOCK_TYPES[type].label}</Button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<div bind:this={blockListEl} class="ed-list" class:is-dragging={Boolean(drag)}>
				{#each blocks as block, index (block.id)}
					{#if data.canEdit}
						<div class:is-drop-target={drag && drag.gap === index && drag.blockId !== block.id && blocks[index - 1]?.id !== drag.blockId}>
							<InsertGap position={index} oninsert={insertBlock} />
						</div>
					{/if}
					<article
						class="ed-block"
						class:is-focused={focusedBlockId === block.id}
						class:is-dragging={drag?.blockId === block.id}
						class:is-lifted={lifted?.blockId === block.id}
						style:transform={drag?.blockId === block.id ? `translateY(${drag.offsetY}px)` : undefined}
						data-block-id={block.id}
						aria-labelledby="block-{block.id}-type"
						onfocusin={() => (focusedBlockId = block.id)}
						onfocusout={(event) => {
							if (!event.currentTarget.contains(/** @type {Node} */ (event.relatedTarget))) {
								focusedBlockId = null;
								if (lifted?.blockId === block.id) {
									lifted = null;
									saveOrder();
								}
							}
						}}
					>
						{#if data.canEdit}
							<button
								class="ed-block__grip"
								type="button"
								aria-label="Reorder {BLOCK_TYPES[block.type].label} block {index + 1} of {blocks.length}. Press Space to pick up."
								aria-pressed={lifted?.blockId === block.id}
								onpointerdown={(event) => startPointerDrag(event, block.id)}
								onkeydown={(event) => handleGripKeydown(event, block.id)}
							><Icon name="grip" /></button>
						{:else}
							<span></span>
						{/if}
						<div style="min-width: 0">
							<div class="ed-block__head" class:ed-block__head--flush={block.type === "separator"}>
								<span class="ed-block__type caps" id="block-{block.id}-type"><Icon name={BLOCK_TYPES[block.type].icon} />{BLOCK_TYPES[block.type].label}</span>
								<div class="row" style="--row-gap: var(--space-2)">
									{#if block.type === "separator"}
										<Segmented
											value={block.content.variant}
											label="Separator style"
											size="sm"
											options={[{ value: "line", label: "Line" }, { value: "space", label: "Space" }]}
											onchange={(variant) => changeBlock(block.id, { content: { variant } })}
										/>
									{/if}
									{#if data.canEdit}
										<div class="ed-block__tools">
											<Button variant="ghost" size="sm" icon="copy" label="Duplicate block" onclick={() => duplicateBlock(block.id)} />
											<Button variant="ghost" size="sm" icon="trash" label="Delete block" onclick={() => deleteBlock(block.id)} />
										</div>
									{/if}
								</div>
							</div>
							{#if block.type === "text"}
								<TextBlockEditor content={block.content} label="Text block {index + 1}" onchange={({ doc, html }) => changeBlock(block.id, { content: { doc }, html })} />
							{:else if block.type === "label_value"}
								<LabelValueEditor content={block.content} blockId={block.id} onchange={(patch) => changeBlock(block.id, patch)} />
							{/if}
						</div>
					</article>
				{/each}
				{#if blocks.length && data.canEdit}
					<div class:is-drop-target={drag && drag.gap === blocks.length && blocks.at(-1)?.id !== drag.blockId}>
						<InsertGap position={blocks.length} oninsert={insertBlock} />
					</div>
				{/if}
			</div>

			{#if blocks.length && data.canEdit}
				<div class="add-block-row">
					<Menu
						label="Add block"
						icon="plus"
						triggerLabel="Add block"
						triggerClass="btn btn--block add-block-btn"
						align="left"
						width="100%"
						items={BLOCK_TYPE_NAMES.map((type) => ({ label: BLOCK_TYPES[type].label, icon: BLOCK_TYPES[type].icon, meta: BLOCK_TYPES[type].description, onselect: () => insertBlock(type, blocks.length) }))}
					/>
				</div>
			{/if}
		</div>
	</div>

	<aside class="editor__preview" aria-label="Live preview">
		<div class="editor__preview-bar">
			<span class="caps">Live preview</span>
			<Segmented bind:value={previewSize} label="Preview size" size="sm" options={[{ value: "phone", icon: "phoneDevice", ariaLabel: "Phone" }, { value: "desktop", icon: "monitor", ariaLabel: "Desktop" }]} />
		</div>
		<div class="device" class:device--desktop={previewSize === "desktop"}>
			<ProgramView {header} {blocks} compact={previewSize === "phone"} />
		</div>
	</aside>
</div>
