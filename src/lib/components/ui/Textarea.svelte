<script>
	/* Multi-line text input. Use inside Field for labels and errors. */
	let {
		value = $bindable(""),
		invalid = false,
		describedBy = undefined,
		class: className = "",
		...rest
	} = $props();
</script>

<textarea
	class="textarea {className}"
	bind:value
	aria-invalid={invalid || undefined}
	aria-describedby={describedBy}
	{...rest}
></textarea>
