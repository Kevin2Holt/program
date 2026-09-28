<script>
	/*
		Button or link styled as a button. Icon-only buttons must pass label.
		loading keeps the button's width and blocks repeat clicks.
	*/
	import Icon from "./Icon.svelte";

	const VARIANT_CLASSES = {
		primary: "btn--primary",
		secondary: "",
		ghost: "btn--ghost",
		danger: "btn--danger",
		dangerQuiet: "btn--danger-quiet"
	};
	const SIZE_CLASSES = { sm: "btn--sm", md: "", lg: "btn--lg" };

	let {
		variant = "secondary",
		size = "md",
		icon = "",
		iconAfter = "",
		label = "",
		href = "",
		type = "button",
		loading = false,
		disabled = false,
		block = false,
		class: className = "",
		children = undefined,
		...rest
	} = $props();

	let buttonType = $derived(/** @type {"button" | "submit" | "reset"} */ (type));
	let classes = $derived([
		"btn",
		VARIANT_CLASSES[variant],
		SIZE_CLASSES[size],
		block && "btn--block",
		!children && icon && "btn--icon",
		loading && "is-loading",
		className
	].filter(Boolean).join(" "));
</script>

{#if href}
	<a class={classes} {href} aria-label={label || undefined} aria-disabled={disabled || undefined} {...rest}>
		{#if icon}<Icon name={icon} />{/if}
		{#if children}<span>{@render children()}</span>{/if}
		{#if iconAfter}<Icon name={iconAfter} />{/if}
	</a>
{:else}
	<button
		class={classes}
		type={buttonType}
		disabled={disabled || loading}
		aria-label={label || undefined}
		aria-busy={loading || undefined}
		{...rest}
	>
		{#if icon}<Icon name={icon} />{/if}
		{#if children}<span>{@render children()}</span>{/if}
		{#if iconAfter}<Icon name={iconAfter} />{/if}
	</button>
{/if}
