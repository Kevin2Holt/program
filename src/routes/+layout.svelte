<script>
	import "@fontsource-variable/inter";
	import "@fontsource/jetbrains-mono/400.css";
	import "$lib/styles/tokens.css";
	import "$lib/styles/components.css";
	import ConfirmHost from "$lib/components/ui/ConfirmHost.svelte";
	import Toaster from "$lib/components/ui/Toaster.svelte";

	let { data, children } = $props();
</script>

<svelte:head>
	<meta name="csrf-token" content={data.csrfToken} />
</svelte:head>

{@render children()}

<Toaster />
<ConfirmHost />
