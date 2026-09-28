<script>
	/* Checkbox with custom box; the native input keeps keyboard and screen-reader behavior. */
	import Icon from "./Icon.svelte";

	let {
		checked = $bindable(false),
		label = "",
		labelHidden = false,
		hint = "",
		disabled = false,
		name = undefined,
		value = undefined,
		onchange = undefined,
		children = undefined,
		...rest
	} = $props();
</script>

<label class="check">
	<input
		type="checkbox"
		bind:checked
		{disabled}
		{name}
		{value}
		aria-label={labelHidden ? label : undefined}
		onchange={(event) => onchange?.(event.currentTarget.checked)}
		{...rest}
	/>
	<span class="check__box"><Icon name="check" /></span>
	{#if children}
		<span class="check__text">{@render children()}</span>
	{:else if label && !labelHidden}
		<span class="check__text">{label}{#if hint}<small>{hint}</small>{/if}</span>
	{/if}
</label>
