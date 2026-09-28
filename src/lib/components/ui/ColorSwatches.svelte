<script>
	/*
		Radio group of accent color swatches. Each swatch sets data-accent on itself,
		so it draws with the same tokens the public pages use, in either theme.
		options: [{ value, label }]
	*/
	import Icon from "./Icon.svelte";

	let { value = $bindable(), options, labelledBy, onchange = undefined } = $props();

	const buttons = $state([]);


	function selectOption(optionValue) {

		value = optionValue;
		onchange?.(optionValue);
	}

	function moveSelection(event, index) {

		const STEP_BY_KEY = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
		const step = STEP_BY_KEY[event.key];
		if (!step) {
			return;
		}
		event.preventDefault();
		const nextIndex = (index + step + options.length) % options.length;
		selectOption(options[nextIndex].value);
		buttons[nextIndex]?.focus();
	}
</script>

<div class="accent-swatches" role="radiogroup" aria-labelledby={labelledBy}>
	{#each options as option, index (option.value)}
		<button
			bind:this={buttons[index]}
			class="accent-swatch"
			type="button"
			role="radio"
			data-accent={option.value}
			aria-checked={option.value === value}
			aria-label={option.label}
			title={option.label}
			tabindex={option.value === value || (!value && index === 0) ? 0 : -1}
			onclick={() => selectOption(option.value)}
			onkeydown={(event) => moveSelection(event, index)}
		>
			{#if option.value === value}<Icon name="check" />{/if}
		</button>
	{/each}
</div>
