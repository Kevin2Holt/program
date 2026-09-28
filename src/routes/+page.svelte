<script>
	import Brand from "$lib/components/app/Brand.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import ThemeToggle from "$lib/components/ui/ThemeToggle.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>progr.am: event programs and signups</title>
	<meta name="description" content="Beautiful event programs people read on their phones, and signup calendars that never double-book." />
</svelte:head>

<div class="landing">
	<header class="landing__top">
		<Brand />
		<div class="row">
			<ThemeToggle initialTheme={data.theme} />
			<Button href="/login" variant="ghost">Log in</Button>
		</div>
	</header>

	<main class="landing__hero">
		<p class="caps">Programs · Signups</p>
		<h1 class="landing__title">Event programs people actually read.</h1>
		<p class="landing__lede">Build the program for your event and share one short link. Add a signup calendar for meals, sessions, or volunteer slots, with no double-booking.</p>
		<div class="row row--wrap" style="justify-content: center">
			<Button href="/signup" variant="primary" size="lg">Create an account</Button>
			<Button href="/login" size="lg">Log in</Button>
		</div>

		<ul class="landing__points">
			<li><Icon name="file" /><span><strong>Programs</strong> built from simple blocks, published to progr.am/your-code.</span></li>
			<li><Icon name="calendar" /><span><strong>Signup calendars</strong> with capacity, time slots, and availability rules.</span></li>
			<li><Icon name="phoneDevice" /><span><strong>Made for phones</strong>, readable one-handed during the event.</span></li>
		</ul>
	</main>
</div>
