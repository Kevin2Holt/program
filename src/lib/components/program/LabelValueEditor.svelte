<script>
	/* Label/value rows. Enter in a value adds a row below. */
	import { tick } from "svelte";
	import { BLOCK_LIMITS, createRowId } from "$lib/blocks/registry.js";
	import Icon from "../ui/Icon.svelte";

	let { content, onchange, blockId } = $props();

	let rows = $derived(content.rows);
	let container = $state();


	function emitRows(nextRows) {

		onchange({ content: { rows: nextRows } });
	}

	function updateRow(index, field, value) {

		emitRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
	}

	async function addRowAfter(index) {

		const nextRows = [...rows];
		nextRows.splice(index + 1, 0, { id: createRowId(), label: "", value: "" });
		emitRows(nextRows);
		await tick();
		container?.querySelectorAll("[data-row-label]")[index + 1]?.focus();
	}

	function removeRow(index) {

		emitRows(rows.length > 1 ? rows.filter((_, rowIndex) => rowIndex !== index) : [{ id: createRowId(), label: "", value: "" }]);
	}
</script>

<div class="lv-rows" bind:this={container}>
	{#each rows as row, index (row.id)}
		<div class="lv-row">
			<input
				class="input lv-row__label"
				data-row-label
				placeholder="Label"
				aria-label="Label {index + 1}"
				maxlength={BLOCK_LIMITS.labelMax}
				value={row.label}
				oninput={(event) => updateRow(index, "label", event.currentTarget.value)}
			/>
			<input
				class="input"
				placeholder="Value"
				aria-label="Value {index + 1}"
				maxlength={BLOCK_LIMITS.valueMax}
				value={row.value}
				oninput={(event) => updateRow(index, "value", event.currentTarget.value)}
				onkeydown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						addRowAfter(index);
					}
				}}
			/>
			<button class="btn btn--ghost btn--icon btn--sm" type="button" aria-label="Remove row {index + 1}" onclick={() => removeRow(index)}><Icon name="x" /></button>
		</div>
	{/each}
	<button class="btn btn--ghost btn--sm" type="button" style="align-self: flex-start" aria-describedby="block-{blockId}-type" onclick={() => addRowAfter(rows.length - 1)}><Icon name="plus" /><span>Add row</span></button>
</div>
