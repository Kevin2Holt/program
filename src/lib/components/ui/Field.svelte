<script>
	/*
		Label, control, hint, and inline error for one form field. The control is
		passed as a snippet that receives the ids it needs for accessibility:
		{ id, labelId, describedBy, invalid }.
		group: the control is not a single input (e.g. segmented), so the label is
		a span referenced by aria-labelledby instead of a <label for>.
	*/
	import Icon from "./Icon.svelte";

	let {
		id,
		label,
		hint = "",
		error = "",
		required = false,
		optional = false,
		group = false,
		labelHidden = false,
		class: className = "",
		children
	} = $props();

	let labelId = $derived(`${id}-label`);
	let hintId = $derived(hint ? `${id}-hint` : "");
	let errorId = $derived(error ? `${id}-error` : "");
	let describedBy = $derived([errorId, hintId].filter(Boolean).join(" ") || undefined);
</script>

<div class="field {className}" class:has-error={Boolean(error)}>
	{#snippet labelText()}
		{label}{#if required}<span class="label__req" aria-hidden="true">*</span>{/if}{#if optional}&nbsp;<span class="label__opt">(optional)</span>{/if}
	{/snippet}
	{#if group}
		<span class="label" class:sr-only={labelHidden} id={labelId}>{@render labelText()}</span>
	{:else}
		<label class="label" class:sr-only={labelHidden} id={labelId} for={id}>{@render labelText()}</label>
	{/if}

	{@render children({ id, labelId, describedBy, invalid: Boolean(error) })}

	{#if error}
		<span class="error-msg" id={errorId} role="alert"><Icon name="alert-circle" />{error}</span>
	{/if}
	{#if hint}
		<span class="hint" id={hintId}>{hint}</span>
	{/if}
</div>
