<script>
	/*
		Short-link field with the "progr.am/" prefix and a live availability check
		(debounced). The server re-checks on save; this is only early feedback.
	*/
	import Field from "../ui/Field.svelte";
	import Icon from "../ui/Icon.svelte";
	import { normalizeEventCode, validateEventCodeShape } from "$lib/validation.js";

	const CHECK_DEBOUNCE_MS = 300;

	let {
		value = $bindable(""),
		publicHost,
		eventId = null,
		unchangedCode = "",
		error = "",
		id = "code",
		name = "code",
		onuserinput = undefined
	} = $props();

	let status = $state({ state: "idle", message: "" });
	let timer = null;
	let requestCounter = 0;

	$effect(() => {
		scheduleCheck(value);
	});


	async function checkCode(code) {

		requestCounter += 1;
		const requestId = requestCounter;
		const response = await fetch(`/api/codes/check?code=${encodeURIComponent(code)}${eventId ? `&eventId=${eventId}` : ""}`);
		const result = response.ok ? await response.json() : { available: false, message: "Couldn't check right now." };
		if (requestId === requestCounter) {
			status = result.available ? { state: "available", message: "Available" } : { state: "taken", message: result.message };
		}
	}

	function scheduleCheck(rawCode) {

		clearTimeout(timer);
		const code = normalizeEventCode(rawCode);
		if (!code || code === unchangedCode) {
			status = { state: "idle", message: "" };
			return;
		}
		const shapeError = validateEventCodeShape(code);
		if (shapeError) {
			status = { state: "taken", message: shapeError };
			return;
		}
		status = { state: "checking", message: "Checking…" };
		timer = setTimeout(() => checkCode(code), CHECK_DEBOUNCE_MS);
	}
</script>

<Field {id} label="Short link" error={error || (status.state === "taken" ? status.message : "")} hint="3–32 characters: lowercase letters, numbers, and hyphens.">
	{#snippet children({ id: fieldId, describedBy, invalid })}
		<div class="input-prefix">
			<span class="input-prefix__text">{publicHost}/</span>
			<input
				id={fieldId}
				{name}
				class="input"
				bind:value
				spellcheck="false"
				autocapitalize="off"
				autocomplete="off"
				aria-describedby={describedBy}
				aria-invalid={invalid || undefined}
				oninput={() => onuserinput?.()}
			/>
		</div>
		{#if status.state === "available" || status.state === "checking"}
			<span class="hint row code-status" class:code-status--ok={status.state === "available"} style="--row-gap: var(--space-1)" aria-live="polite">
				<Icon name={status.state === "available" ? "check" : "loader"} />{status.message}
			</span>
		{/if}
	{/snippet}
</Field>
