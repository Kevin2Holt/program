<script>
	/*
		Segmented control: a radiogroup with roving focus. Arrow keys move and
		select, like native radios. options: [{ value, label, icon? }]
	*/
	import Icon from "./Icon.svelte";

	let {
		value = $bindable(),
		options,
		label = "",
		labelledBy = undefined,
		block = false,
		size = "md",
		onchange = undefined
	} = $props();

	const buttons = $state([]);


	function selectOption(optionValue) {

		if (optionValue === value) {
			return;
		}
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

<div
	class="segmented"
	class:segmented--block={block}
	class:segmented--sm={size === "sm"}
	role="radiogroup"
	aria-label={labelledBy ? undefined : label}
	aria-labelledby={labelledBy}
>
	{#each options as option, index (option.value)}
		<button
			bind:this={buttons[index]}
			class="segmented__opt"
			type="button"
			role="radio"
			aria-checked={option.value === value}
			aria-label={option.ariaLabel}
			tabindex={option.value === value || (value === undefined && index === 0) ? 0 : -1}
			onclick={() => selectOption(option.value)}
			onkeydown={(event) => moveSelection(event, index)}
		>
			{#if option.icon}<Icon name={option.icon} />{/if}
			{#if option.label}{option.label}{/if}
			{#if option.count !== undefined}<span class="subtle tabular">{option.count}</span>{/if}
		</button>
	{/each}
</div>
