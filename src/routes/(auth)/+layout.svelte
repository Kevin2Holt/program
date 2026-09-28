<script>
	import Brand from "$lib/components/app/Brand.svelte";
	import ThemeToggle from "$lib/components/ui/ThemeToggle.svelte";
	import { page } from "$app/state";

	let { children } = $props();
</script>

<div class="auth">
	<div class="auth__top">
		<Brand />
		<ThemeToggle initialTheme={page.data.theme} />
	</div>
	<main class="auth__card">
		{@render children()}
	</main>
</div>
