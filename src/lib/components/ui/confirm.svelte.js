/*
	Promise-based confirmation, replacing window.confirm():
		if (await confirmAction({ title, message, confirmLabel, tone: "danger" })) { ... }
	One <ConfirmHost /> in the root layout renders the pending request.
*/


export const confirmState = $state({ request: null });


export function confirmAction({ title, message = "", confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "danger", icon = "" }) {

	return new Promise((resolve) => {
		confirmState.request = { title, message, confirmLabel, cancelLabel, tone, icon, resolve };
	});
}

export function settleConfirm(confirmed) {

	const request = confirmState.request;
	confirmState.request = null;
	request?.resolve(confirmed);
}
