<script>
	/*
		One icon from the shared set. Decorative by default (aria-hidden); pass
		label to make it a meaningful image.
	*/
	import { ICON_PATHS } from "../icons.js";

	let { name, label = "", class: className = "" } = $props();
</script>

<svg
	class="icon {className}"
	viewBox="0 0 24 24"
	aria-hidden={label ? undefined : "true"}
	role={label ? "img" : undefined}
	aria-label={label || undefined}
>{@html ICON_PATHS[name] || ""}</svg>
