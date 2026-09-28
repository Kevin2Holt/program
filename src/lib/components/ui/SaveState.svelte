<script>
	/* Autosave indicator. status: idle | saving | saved | error */
	import Icon from "./Icon.svelte";

	let { status = "idle", onretry = undefined } = $props();
</script>

<span class="save-state" class:is-saving={status === "saving"} class:is-saved={status === "saved"} class:is-error={status === "error"} aria-live="polite">
	{#if status === "saving"}
		<Icon name="loader" /><span>Saving…</span>
	{:else if status === "saved"}
		<Icon name="cloud-check" /><span>Saved</span>
	{:else if status === "error"}
		<Icon name="alert-circle" /><span>Not saved</span>
		{#if onretry}<button class="btn btn--ghost btn--sm" type="button" onclick={onretry}>Retry</button>{/if}
	{/if}
</span>
