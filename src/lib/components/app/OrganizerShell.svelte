<script>
	/*
		Organizer layout: sticky sidebar (event switcher and navigation) beside the
		page. Pages render their own <Topbar> so each controls its breadcrumbs and
		actions. On small screens the sidebar becomes an off-canvas drawer.
		sections: [{ label?, links: [{ href, label, icon, count?, match? }] }]
	*/
	import { page } from "$app/state";
	import Brand from "./Brand.svelte";
	import Icon from "../ui/Icon.svelte";
	import Menu from "../ui/Menu.svelte";
	import { closeNav, navState } from "./nav.svelte.js";

	let { user, sections, eventSwitcher = undefined, children } = $props();

	let logoutForm = $state();


	function checkLinkActive(link) {

		const path = page.url.pathname;
		return link.exact ? path === link.href : path === link.href || path.startsWith(link.href + "/");
	}

	$effect(() => {
		// Close the mobile drawer after navigating.
		page.url.pathname;
		closeNav();
	});
</script>

<div class="app" class:nav-open={navState.open}>
	<aside class="sidebar" aria-label="Organizer navigation">
		<Brand href="/dashboard" />
		{#if eventSwitcher}{@render eventSwitcher()}{/if}

		{#each sections as section, sectionIndex (sectionIndex)}
			<nav class="nav-group" aria-label={section.label || "Main"}>
				{#if section.label}<div class="nav-group__label caps">{section.label}</div>{/if}
				{#each section.links as link (link.href)}
					<a class="nav-link" href={link.href} aria-current={checkLinkActive(link) ? "page" : undefined}>
						<Icon name={link.icon} /><span>{link.label}</span>
						{#if link.count !== undefined}<span class="nav-link__count">{link.count}</span>{/if}
					</a>
				{/each}
			</nav>
		{/each}

		<div class="sidebar__foot row">
			<a class="nav-link grow" href="/account" aria-current={page.url.pathname === "/account" ? "page" : undefined}>
				<Icon name="user" /><span class="grow" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{user.displayName}</span>
			</a>
			<Menu
				label="Account menu"
				align="left"
				items={[
					{ label: "Account settings", icon: "sliders", href: "/account" },
					{ label: "Log out", icon: "log-out", onselect: () => logoutForm.requestSubmit() }
				]}
			/>
			<form bind:this={logoutForm} method="POST" action="/logout" hidden>
				<input type="hidden" name="csrf" value={page.data.csrfToken} />
			</form>
		</div>
	</aside>

	{#if navState.open}
		<button class="nav-scrim" type="button" aria-label="Close navigation" onclick={closeNav}></button>
	{/if}

	<div class="main">
		{@render children()}
	</div>
</div>
