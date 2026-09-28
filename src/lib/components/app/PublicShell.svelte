<script>
	/* Public event header (event name, Program / Sign up tabs, theme) and footer. */
	import { page } from "$app/state";
	import ThemeToggle from "../ui/ThemeToggle.svelte";

	let { event, hasCalendar = false, children } = $props();

	let onCalendar = $derived(page.url.pathname.startsWith(`/${event.code}/calendar`));
</script>

<div class="is-public">
	<header class="pub-header">
		<div class="pub-header__inner">
			<a class="pub-header__title" href="/{event.code}" style="color: inherit">{event.name}</a>
			<nav class="pub-tabs" aria-label="Event">
				{#if hasCalendar}
					<a class="pub-tab" href="/{event.code}" aria-current={onCalendar ? undefined : "page"}>Program</a>
					<a class="pub-tab" href="/{event.code}/calendar" aria-current={onCalendar ? "page" : undefined}>Sign up</a>
				{/if}
			</nav>
			<ThemeToggle initialTheme={page.data.theme} />
		</div>
	</header>

	{@render children()}

	<footer class="pub-foot">Made with <a href="/">progr.am</a></footer>
</div>
