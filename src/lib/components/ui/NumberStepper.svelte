<script>
	/* Whole-number input with − / + buttons. Typed values are clamped on blur. */
	import Icon from "./Icon.svelte";

	let {
		value = $bindable(1),
		min = 0,
		max = 9999,
		id = undefined,
		describedBy = undefined,
		invalid = false,
		label = "Number",
		onchange = undefined
	} = $props();

	// Follows value, but can be edited freely until committed.
	let text = $derived(String(value));


	function setClampedValue(next) {

		const clamped = Math.min(max, Math.max(min, Math.round(next)));
		if (clamped !== value) {
			value = clamped;
			onchange?.(clamped);
		}
		text = String(clamped);
	}

	function commitTypedValue() {

		const parsed = Number.parseInt(text, 10);
		setClampedValue(Number.isNaN(parsed) ? value : parsed);
	}
</script>

<div class="stepper">
	<button class="btn btn--icon stepper__btn" type="button" aria-label="Decrease {label}" disabled={value <= min} onclick={() => setClampedValue(value - 1)}><Icon name="minus" /></button>
	<input
		class="input tabular stepper__input"
		{id}
		inputmode="numeric"
		bind:value={text}
		aria-describedby={describedBy}
		aria-invalid={invalid || undefined}
		onblur={commitTypedValue}
		onkeydown={(event) => {
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setClampedValue(value + 1);
			}
			else if (event.key === "ArrowDown") {
				event.preventDefault();
				setClampedValue(value - 1);
			}
			else if (event.key === "Enter") {
				commitTypedValue();
			}
		}}
	/>
	<button class="btn btn--icon stepper__btn" type="button" aria-label="Increase {label}" disabled={value >= max} onclick={() => setClampedValue(value + 1)}><Icon name="plus" /></button>
</div>
