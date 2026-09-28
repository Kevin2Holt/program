/*
	Autosave queue. Each key (a block id, or "header") has its own debounce
	timer, and its saves run one after another so an older save can never land
	after a newer one. The save function reads the latest state when it runs.
	status: idle | saving | saved | error (for the SaveState indicator).
*/
/* eslint-disable svelte/prefer-svelte-reactivity -- plain bookkeeping; only `state` drives the UI */


export function createSaveQueue(debounceMs) {

	const timers = new Map();
	const chains = new Map();
	const failed = new Map();
	const state = $state({ status: "idle", inFlight: 0, scheduled: 0 });

	function refreshStatus() {

		state.scheduled = timers.size;
		if (failed.size) {
			state.status = "error";
		}
		else if (state.inFlight > 0 || timers.size > 0) {
			state.status = "saving";
		}
		else if (state.status !== "idle") {
			state.status = "saved";
		}
	}

	function runNow(key, save) {

		state.inFlight += 1;
		refreshStatus();
		const chain = (chains.get(key) || Promise.resolve()).then(async () => {
			const result = await save();
			if (result && result.ok === false) {
				failed.set(key, save);
			}
			else {
				failed.delete(key);
			}
			return result;
		}).finally(() => {
			state.inFlight -= 1;
			refreshStatus();
		});
		chains.set(key, chain);
		return chain;
	}

	function schedule(key, save) {

		clearTimeout(timers.get(key)?.timer);
		const timer = setTimeout(() => {
			timers.delete(key);
			runNow(key, save);
		}, debounceMs);
		timers.set(key, { timer, save });
		state.status = "saving";
		refreshStatus();
	}

	function cancel(key) {

		clearTimeout(timers.get(key)?.timer);
		timers.delete(key);
		failed.delete(key);
		refreshStatus();
	}

	async function flush() {

		for (const [key, entry] of [...timers]) {
			clearTimeout(entry.timer);
			timers.delete(key);
			runNow(key, entry.save);
		}
		await Promise.all([...chains.values()]);
	}

	function retryFailed() {

		for (const [key, save] of [...failed]) {
			failed.delete(key);
			runNow(key, save);
		}
	}

	function checkHasPendingWork() {

		return timers.size > 0 || state.inFlight > 0;
	}

	return { state, schedule, runNow, cancel, flush, retryFailed, checkHasPendingWork };
}
