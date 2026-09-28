<script>
	/*
		Page top bar: menu button (small screens), breadcrumbs, page actions, and
		the theme toggle. crumbs: [{ label, href? }]; the last crumb is the page.
	*/
	import { page } from "$app/state";
	import Icon from "../ui/Icon.svelte";
	import ThemeToggle from "../ui/ThemeToggle.svelte";
	import { navState, toggleNav } from "./nav.svelte.js";

	let { crumbs, actions = undefined } = $props();
</script>

<header class="topbar">
	<button class="btn btn--ghost btn--icon mobile-nav-btn" type="button" aria-label="Open navigation" aria-expanded={navState.open} onclick={toggleNav}>
		<Icon name="menu" />
	</button>
	<nav class="crumbs grow" aria-label="Breadcrumb">
		{#each crumbs as crumb, index (index)}
			{#if index < crumbs.length - 1}
				{#if crumb.href}<a href={crumb.href}>{crumb.label}</a>{:else}<span>{crumb.label}</span>{/if}
				<span class="crumbs__sep" aria-hidden="true">/</span>
			{:else}
				<span class="crumbs__current" aria-current="page">{crumb.label}</span>
			{/if}
		{/each}
	</nav>
	{#if actions}{@render actions()}{/if}
	<ThemeToggle initialTheme={page.data.theme} />
</header>
