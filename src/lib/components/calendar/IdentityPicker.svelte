<script>
	/*
		Color swatches and shape choices for an Item (radiogroups with arrow-key
		movement). Choosing "Letter or number" reveals a glyph select.
	*/
	import ItemMarker from "../ui/ItemMarker.svelte";
	import Select from "../ui/Select.svelte";
	import { GLYPH_SHAPE, GLYPHS, ITEM_COLORS, ITEM_SHAPES } from "$lib/calendar/palette.js";

	const COLOR_NAMES = { red: "Red", orange: "Orange", amber: "Amber", lime: "Lime", green: "Green", teal: "Teal", sky: "Sky", blue: "Blue", violet: "Violet", pink: "Pink", brown: "Brown", slate: "Slate" };
	const SHAPE_NAMES = { circle: "Circle", square: "Square", triangle: "Triangle", diamond: "Diamond", hexagon: "Hexagon", star: "Star", glyph: "Letter or number" };
	const SHAPE_CHOICES = [...ITEM_SHAPES, GLYPH_SHAPE];
	const ARROW_STEPS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

	let { color = $bindable(), shape = $bindable(), glyph = $bindable() } = $props();


	function moveChoice(event, list, current, apply) {

		const step = ARROW_STEPS[event.key];
		if (!step) {
			return;
		}
		event.preventDefault();
		const next = list[(list.indexOf(current) + step + list.length) % list.length];
		apply(next);
		setTimeout(() => event.currentTarget.parentElement?.querySelector("[aria-checked=true]")?.focus());
	}

	function chooseShape(nextShape) {

		shape = nextShape;
		if (nextShape === GLYPH_SHAPE && !glyph) {
			glyph = "A";
		}
		if (nextShape !== GLYPH_SHAPE) {
			glyph = null;
		}
	}
</script>

<div class="field">
	<span class="label" id="color-label">Color</span>
	<div class="swatches" role="radiogroup" aria-labelledby="color-label">
		{#each ITEM_COLORS as option (option)}
			<button
				class="swatch"
				type="button"
				role="radio"
				data-color={option}
				aria-checked={option === color}
				aria-label={COLOR_NAMES[option]}
				tabindex={option === color ? 0 : -1}
				onclick={() => (color = option)}
				onkeydown={(event) => moveChoice(event, ITEM_COLORS, color, (next) => (color = next))}
			></button>
		{/each}
	</div>
</div>

<div class="field">
	<span class="label" id="shape-label">Shape</span>
	<div class="shape-grid" role="radiogroup" aria-labelledby="shape-label">
		{#each SHAPE_CHOICES as option (option)}
			<button
				class="shape-opt"
				type="button"
				role="radio"
				aria-checked={option === shape}
				aria-label={SHAPE_NAMES[option]}
				title={SHAPE_NAMES[option]}
				tabindex={option === shape ? 0 : -1}
				onclick={() => chooseShape(option)}
				onkeydown={(event) => moveChoice(event, SHAPE_CHOICES, shape, chooseShape)}
			>
				<ItemMarker color="slate" shape={option} glyph={option === GLYPH_SHAPE ? glyph || "A" : ""} size="lg" />
			</button>
		{/each}
	</div>
	{#if shape === GLYPH_SHAPE}
		<div style="width: 8rem; margin-top: var(--space-1)">
			<Select bind:value={glyph} label="Letter or number" options={GLYPHS.map((character) => ({ value: character, label: character }))} />
		</div>
	{/if}
</div>
