<script>
	import Alert from "$lib/components/ui/Alert.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Field from "$lib/components/ui/Field.svelte";
	import Form from "$lib/components/ui/Form.svelte";
	import Input from "$lib/components/ui/Input.svelte";

	let { data, form } = $props();
</script>

<svelte:head><title>Log in · progr.am</title></svelte:head>

<div class="card">
	<div class="card__body stack" style="--stack-gap: var(--space-4)">
		<div>
			<h1 class="auth__title">Log in</h1>
			<p class="muted">Manage your event programs and signups.</p>
		</div>

		{#if form?.message}
			<Alert tone="danger" role="alert">{form.message}</Alert>
		{/if}

		<Form class="stack" style="--stack-gap: var(--space-4)">
			{#snippet children({ pending })}
				<input type="hidden" name="returnTo" value={data.returnTo} />
				<Field id="email" label="Email" error={form?.errors?.email}>
					{#snippet children({ id, describedBy, invalid })}
						<Input {id} name="email" type="email" autocomplete="email" value={form?.values?.email || ""} {describedBy} {invalid} data-autofocus />
					{/snippet}
				</Field>
				<Field id="password" label="Password" error={form?.errors?.password}>
					{#snippet children({ id, describedBy, invalid })}
						<Input {id} name="password" type="password" autocomplete="current-password" {describedBy} {invalid} />
					{/snippet}
				</Field>
				<Button type="submit" variant="primary" block loading={pending}>Log in</Button>
			{/snippet}
		</Form>
	</div>
	<div class="card__foot" style="justify-content: center">
		<span class="muted">New here? <a href="/signup{data.returnTo !== "/dashboard" ? `?returnTo=${encodeURIComponent(data.returnTo)}` : ""}">Create an account</a></span>
	</div>
</div>
