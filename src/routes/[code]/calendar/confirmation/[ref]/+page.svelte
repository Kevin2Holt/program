<script>
	import PicksSummary from "$lib/components/calendar/PicksSummary.svelte";
	import Alert from "$lib/components/ui/Alert.svelte";
	import Badge from "$lib/components/ui/Badge.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import { showToast } from "$lib/components/ui/toast.svelte.js";

	let { data } = $props();

	let confirmation = $derived(data.confirmation);
	let picks = $derived(confirmation.selections.map((selection) => ({ ...selection, key: String(selection.id), label: selection.timeLabel })));
	let itemsById = $derived(confirmation.itemsById);


	async function copyLink() {

		try {
			await navigator.clipboard.writeText(confirmation.link);
			showToast("Link copied");
		}
		catch {
			showToast("Select the link to copy it", { icon: "info" });
		}
	}
</script>

<svelte:head>
	<title>{confirmation.canceled ? "Signup canceled" : "You're signed up"} · {data.publicEvent.name}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="narrow">
	<div class="confirm-hero">
		{#if confirmation.canceled}
			<div class="confirm-hero__icon confirm-hero__icon--canceled"><Icon name="x" /></div>
			<h1 class="confirm-hero__title">This signup was canceled</h1>
		{:else}
			<div class="confirm-hero__icon"><Icon name="check" /></div>
			<h1 class="confirm-hero__title">You're signed up, {confirmation.name.split(" ")[0]}</h1>
		{/if}
		<p class="muted">{confirmation.calendarTitle} · {data.publicEvent.name}</p>
	</div>

	<div class="stack" style="--stack-gap: var(--space-4)">
		<PicksSummary {picks} {itemsById} title="Your signups">
			{#snippet headAction()}
				<Badge tone={confirmation.canceled ? "neutral" : "success"}>{confirmation.canceled ? "Canceled" : `${picks.length} confirmed`}</Badge>
			{/snippet}
		</PicksSummary>

		{#if confirmation.icsEnabled && !confirmation.canceled}
			<Button href={confirmation.icsPath} size="lg" block icon="calendar-plus" download>Add to my calendar</Button>
		{/if}

		{#if confirmation.email}
			<Alert tone="info" icon="mail">
				{#if confirmation.emailSent}We sent a confirmation to <strong>{confirmation.email}</strong>.{:else}We'll use <strong>{confirmation.email}</strong> if we need to reach you.{/if}
			</Alert>
		{/if}

		<div class="card">
			<div class="card__body stack" style="--stack-gap: var(--space-2)">
				<div class="label">Your confirmation link</div>
				<p class="hint">Save this link to see your signups later. Anyone with the link can view them.</p>
				<div class="link-box">
					<a href={confirmation.link}>{confirmation.link}</a>
					<Button size="sm" icon="copy" onclick={copyLink}>Copy</Button>
				</div>
			</div>
		</div>

		<div class="row" style="justify-content: center; margin-top: var(--space-2)">
			<Button variant="ghost" icon="arrow-left" href="/{data.publicEvent.code}/calendar">Back to the calendar</Button>
		</div>
	</div>
</main>
