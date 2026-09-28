<script>
	/* Renders confirmAction() requests as a custom alert dialog. Mounted once in the root layout. */
	import Dialog from "./Dialog.svelte";
	import Icon from "./Icon.svelte";
	import { confirmState, settleConfirm } from "./confirm.svelte.js";

	const TONE_ICONS = { danger: "trash", warning: "alert-triangle", neutral: "info" };

	let open = $state(false);
	let request = $state(null);
	let settled = false;

	$effect(() => {
		if (confirmState.request) {
			request = confirmState.request;
			settled = false;
			open = true;
		}
	});


	function finish(confirmed) {

		if (settled) {
			return;
		}
		settled = true;
		open = false;
		settleConfirm(confirmed);
	}
</script>

<Dialog bind:open alert labelledBy="confirm-title" describedBy="confirm-text" onclose={() => finish(false)}>
	{#if request}
		<div class="dialog__body">
			<div class="dialog__icon" class:dialog__icon--warning={request.tone === "warning"} class:dialog__icon--neutral={request.tone === "neutral"}>
				<Icon name={request.icon || TONE_ICONS[request.tone] || "info"} />
			</div>
			<h2 class="dialog__title" id="confirm-title">{request.title}</h2>
			{#if request.message}<p class="dialog__text" id="confirm-text">{request.message}</p>{/if}
		</div>
		<div class="dialog__foot">
			<button class="btn btn--ghost" type="button" data-autofocus onclick={() => finish(false)}>{request.cancelLabel}</button>
			<button class="btn" class:btn--danger={request.tone === "danger"} class:btn--primary={request.tone !== "danger"} type="button" onclick={() => finish(true)}>{request.confirmLabel}</button>
		</div>
	{/if}
</Dialog>
