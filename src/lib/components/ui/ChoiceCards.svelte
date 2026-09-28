<script>
	/* Large touch-friendly radio choices (public forms). options: [{ value, label, icon? }] */
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

<div class="choice-cards" role="radiogroup" aria-labelledby={labelledBy}>
	{#each options as option, index (option.value)}
		<button
			bind:this={buttons[index]}
			class="choice-card"
			type="button"
			role="radio"
			aria-checked={option.value === value}
			tabindex={option.value === value || (!value && index === 0) ? 0 : -1}
			onclick={() => selectOption(option.value)}
			onkeydown={(event) => moveSelection(event, index)}
		>
			{#if option.icon}<Icon name={option.icon} />{/if}{option.label}
		</button>
	{/each}
</div>
