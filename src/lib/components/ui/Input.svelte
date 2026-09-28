<script>
	/* Text-like input with design-system styling. Use inside Field for labels and errors. */
	let {
		value = $bindable(""),
		invalid = false,
		describedBy = undefined,
		class: className = "",
		element = $bindable(undefined),
		...rest
	} = $props();
</script>

<input
	class="input {className}"
	bind:value
	bind:this={element}
	aria-invalid={invalid || undefined}
	aria-describedby={describedBy}
	{...rest}
/>
