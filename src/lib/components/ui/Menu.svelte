<script>
	/*
		Overflow menu. items: [{ label, icon?, onselect?, href?, danger?, disabled? }]
		Keyboard: arrows move, Enter/Space choose, Escape closes.
	*/
	import { tick } from "svelte";
	import Icon from "./Icon.svelte";
	import { dismissable, placePopover } from "./floating.js";

	let {
		items,
		label = "More actions",
		icon = "more",
		triggerLabel = "",
		size = "sm",
		align = "right",
		width = undefined
	} = $props();

	let open = $state(false);
	let triggerEl = $state();
	let menuEl = $state();


	function focusItem(index) {

		const buttons = [...menuEl.querySelectorAll("[role=menuitem]:not([disabled])")];
		buttons[(index + buttons.length) % buttons.length]?.focus();
	}

	async function openMenu() {

		open = true;
		await tick();
		focusItem(0);
	}

	function closeMenu(returnFocus = true) {

		open = false;
		if (returnFocus) {
			triggerEl?.focus();
		}
	}

	function chooseItem(item) {

		closeMenu(!item.href);
		item.onselect?.();
	}

	function handleMenuKeydown(event) {

		const buttons = [...menuEl.querySelectorAll("[role=menuitem]:not([disabled])")];
		const index = buttons.indexOf(document.activeElement);
		if (event.key === "ArrowDown") {
			event.preventDefault();
			focusItem(index + 1);
		}
		else if (event.key === "ArrowUp") {
			event.preventDefault();
			focusItem(index - 1);
		}
		else if (event.key === "Tab") {
			closeMenu(false);
		}
	}
</script>

<div
	class="select"
	use:dismissable={(reason) => {
		if (open) {
			closeMenu(reason === "escape");
		}
	}}
>
	<button
		bind:this={triggerEl}
		class="btn"
		class:btn--ghost={!triggerLabel}
		class:btn--icon={!triggerLabel}
		class:btn--sm={size === "sm"}
		type="button"
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label={triggerLabel ? undefined : label}
		onclick={() => (open ? closeMenu() : openMenu())}
	>
		<Icon name={icon} />{#if triggerLabel}<span>{triggerLabel}</span>{/if}
	</button>
	{#if open}
		<div bind:this={menuEl} class="popover menu" class:popover--right={align === "right"} style:width role="menu" tabindex="-1" onkeydown={handleMenuKeydown} use:placePopover>
			{#each items as item (item.label)}
				{#if item.href}
					<a class="menu__item" class:menu__item--danger={item.danger} role="menuitem" href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined} onclick={() => chooseItem(item)}>
						{#if item.icon}<Icon name={item.icon} />{/if}{item.label}
					</a>
				{:else}
					<button class="menu__item" class:menu__item--danger={item.danger} role="menuitem" type="button" disabled={item.disabled} onclick={() => chooseItem(item)}>
						{#if item.icon}<Icon name={item.icon} />{/if}<span class="grow">{item.label}</span>
						{#if item.meta}<span class="option__meta">{item.meta}</span>{/if}
					</button>
				{/if}
			{/each}
		</div>
	{/if}
</div>
