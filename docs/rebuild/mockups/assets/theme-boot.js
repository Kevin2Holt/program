/*
	Runs synchronously in <head> before first paint so the page never flashes the
	wrong theme. ?theme=light|dark wins (used for side-by-side review), then the
	remembered choice, then the dark default. The real app does this on the
	server from a cookie instead.
*/
(function applyInitialTheme() {

	let theme = new URLSearchParams(location.search).get("theme");
	if (theme !== "light" && theme !== "dark") {
		try {
			theme = localStorage.getItem("progr-theme");
		}
		catch (err) {
			theme = null;
		}
	}
	document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
})();
