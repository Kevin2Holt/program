<script>
	/* The "+" between blocks: pick a block type to insert at this position. */
	import Menu from "../ui/Menu.svelte";
	import { BLOCK_TYPES, BLOCK_TYPE_NAMES } from "$lib/blocks/registry.js";

	let { position, oninsert } = $props();
</script>

<div class="ed-insert">
	<Menu
		label="Insert a block here"
		icon="plus"
		align="left"
		triggerClass="ed-insert__btn"
		width="16rem"
		items={BLOCK_TYPE_NAMES.map((type) => ({
			label: BLOCK_TYPES[type].label,
			icon: BLOCK_TYPES[type].icon,
			meta: BLOCK_TYPES[type].description,
			onselect: () => oninsert(type, position)
		}))}
	/>
</div>
