<script>
	/*
		Switches dark/light instantly and remembers the choice in a cookie, which
		the server reads so the next page arrives in the right theme (no flash).
	*/
	import Icon from "./Icon.svelte";

	const THEME_COOKIE = "progr_theme";
	const ONE_YEAR_S = 365 * 24 * 60 * 60;

	let { initialTheme = "dark" } = $props();
	let chosenTheme = $state(null);
	let theme = $derived(chosenTheme ?? initialTheme);


	function toggleTheme() {

		chosenTheme = theme === "dark" ? "light" : "dark";
		document.documentElement.dataset.theme = chosenTheme;
		document.cookie = `${THEME_COOKIE}=${chosenTheme}; path=/; max-age=${ONE_YEAR_S}; samesite=lax`;
	}
</script>

<button
	class="btn btn--ghost btn--icon"
	type="button"
	aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
	title={theme === "dark" ? "Light theme" : "Dark theme"}
	onclick={toggleTheme}
>
	<Icon name={theme === "dark" ? "sun" : "moon"} />
</button>
