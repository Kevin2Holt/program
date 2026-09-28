<script>
	/* Renders toasts. Mounted once in the root layout; announced politely to screen readers. */
	import Icon from "./Icon.svelte";
	import { dismissToast, toastState } from "./toast.svelte.js";
</script>

<div class="toasts" role="status" aria-live="polite">
	{#each toastState.toasts as toast (toast.id)}
		<div class="toast" class:is-leaving={toast.leaving} class:toast--danger={toast.tone === "danger"}>
			<Icon name={toast.icon} />
			<span class="grow">{toast.message}</span>
			{#if toast.actionLabel}
				<button
					class="btn btn--sm btn--ghost toast__action"
					type="button"
					onclick={() => {
						toast.onAction?.();
						dismissToast(toast.id);
					}}
				>{toast.actionLabel}</button>
			{/if}
		</div>
	{/each}
</div>
