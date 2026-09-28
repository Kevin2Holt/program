<script>
	/*
		Modal dialog or side drawer, built on the native <dialog> element: the
		browser traps focus, makes the page behind inert, and closes on Escape.
		Clicking the backdrop closes it. Focus goes to [data-autofocus] if present.
		variant: dialog | drawer. Set alert for destructive confirmations.
	*/
	import { tick } from "svelte";

	let {
		open = $bindable(false),
		variant = "dialog",
		size = "md",
		alert = false,
		labelledBy,
		describedBy = undefined,
		onclose = undefined,
		children
	} = $props();

	let dialogEl = $state();


	async function focusPreferredElement() {

		await tick();
		const preferred = dialogEl?.querySelector("[data-autofocus]");
		preferred?.focus();
	}

	$effect(() => {
		if (!dialogEl) {
			return;
		}
		if (open && !dialogEl.open) {
			dialogEl.showModal();
			focusPreferredElement();
		}
		else if (!open && dialogEl.open) {
			dialogEl.close();
		}
	});
</script>

<dialog
	bind:this={dialogEl}
	class="modal"
	class:modal--drawer={variant === "drawer"}
	class:modal--wide={size === "wide"}
	role={alert ? "alertdialog" : undefined}
	aria-labelledby={labelledBy}
	aria-describedby={describedBy}
	onclose={() => {
		open = false;
		onclose?.();
	}}
	onclick={(event) => {
		if (event.target === dialogEl) {
			open = false;
		}
	}}
>
	{#if open}
		<div class="modal__panel">
			{@render children()}
		</div>
	{/if}
</dialog>
