<script>
	/*
		Form posting to a SvelteKit action without a page reload. Adds the CSRF
		field, tracks pending state (for button spinners), and reports the action
		result so callers can toast or close drawers. Field errors come back in
		the page's `form` prop and render inline.
	*/
	import { enhance } from "$app/forms";
	import { page } from "$app/state";

	let {
		action = "",
		reset = false,
		invalidateAll = true,
		class: className = "",
		onsuccess = undefined,
		onfailure = undefined,
		children,
		...rest
	} = $props();

	let pending = $state(false);
</script>

<form
	method="POST"
	{action}
	class={className}
	novalidate
	use:enhance={() => {
		pending = true;
		return async ({ result, update }) => {
			pending = false;
			await update({ reset, invalidateAll });
			if (result.type === "success" || result.type === "redirect") {
				onsuccess?.(result);
			}
			else if (result.type === "failure") {
				onfailure?.(result);
			}
		};
	}}
	{...rest}
>
	<input type="hidden" name="csrf" value={page.data.csrfToken} />
	{@render children({ pending })}
</form>
