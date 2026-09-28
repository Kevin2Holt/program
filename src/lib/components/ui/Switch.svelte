<script>
	/* On/off toggle. A native checkbox with role=switch, visually replaced. */
	let {
		checked = $bindable(false),
		label = "",
		labelHidden = false,
		disabled = false,
		describedBy = undefined,
		name = undefined,
		onchange = undefined,
		...rest
	} = $props();
</script>

<label class="switch">
	<input
		type="checkbox"
		role="switch"
		bind:checked
		{disabled}
		{name}
		aria-describedby={describedBy}
		aria-label={labelHidden ? label : undefined}
		onchange={(event) => onchange?.(event.currentTarget.checked)}
		{...rest}
	/>
	<span class="switch__track"></span>
	{#if label && !labelHidden}<span class="switch__text">{label}</span>{/if}
</label>
