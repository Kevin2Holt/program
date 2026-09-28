<script>
	/* Styled error page. Shows only a friendly message and a reference id, never internals. */
	import { page } from "$app/state";
	import Brand from "$lib/components/app/Brand.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";

	const SERVER_ERROR_MIN = 500;
	const MESSAGES_BY_STATUS = {
		403: { title: "You can't open this page", icon: "lock" },
		404: { title: "Page not found", icon: "search", text: "Check the link, or ask whoever shared it for the right one." },
		429: { title: "Slow down a little", icon: "clock" }
	};

	let info = $derived(MESSAGES_BY_STATUS[page.status] || { title: "Something went wrong", icon: "alert-triangle" });
	let text = $derived(page.status === 404 ? info.text : page.error?.message);
</script>

<svelte:head><title>{info.title} · progr.am</title></svelte:head>

<div class="auth">
	<div class="auth__top"><Brand /></div>
	<main class="auth__card" style="width: min(100%, 28rem)">
		<EmptyState icon={info.icon} title={info.title} {text} solid>
			<Button href="/" size="sm">Go home</Button>
		</EmptyState>
		{#if page.error?.reference && page.status >= SERVER_ERROR_MIN}
			<p class="hint" style="text-align: center; margin-top: var(--space-3)">Reference: <span class="tabular" style="font-family: var(--font-mono)">{page.error.reference}</span></p>
		{/if}
	</main>
</div>
