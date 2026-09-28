/*
	Toast notifications: showToast("Saved") from anywhere in the browser.
	Optional action (e.g. Undo) runs its callback and dismisses the toast.
*/


const DEFAULT_LIFETIME_MS = 3200;
const ACTION_LIFETIME_MS = 6000;
const LEAVE_ANIMATION_MS = 200;

export const toastState = $state({ toasts: [] });
let nextToastId = 1;


export function dismissToast(toastId) {

	const toast = toastState.toasts.find((entry) => entry.id === toastId);
	if (!toast || toast.leaving) {
		return;
	}
	toast.leaving = true;
	setTimeout(() => {
		toastState.toasts = toastState.toasts.filter((entry) => entry.id !== toastId);
	}, LEAVE_ANIMATION_MS);
}

export function showToast(message, { icon = "check", tone = "success", actionLabel = "", onAction = null, lifetimeMs = 0 } = {}) {

	const id = nextToastId;
	nextToastId += 1;
	toastState.toasts.push({ id, message, icon, tone, actionLabel, onAction, leaving: false });
	setTimeout(() => dismissToast(id), lifetimeMs || (actionLabel ? ACTION_LIFETIME_MS : DEFAULT_LIFETIME_MS));
	return id;
}

export function showErrorToast(message) {

	return showToast(message, { icon: "alert-circle", tone: "danger", lifetimeMs: ACTION_LIFETIME_MS });
}
