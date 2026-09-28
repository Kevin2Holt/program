<script>
	import Alert from "$lib/components/ui/Alert.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Field from "$lib/components/ui/Field.svelte";
	import Form from "$lib/components/ui/Form.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import { LIMITS } from "$lib/validation.js";

	let { data, form } = $props();
</script>

<svelte:head><title>Create an account · progr.am</title></svelte:head>

<div class="card">
	<div class="card__body stack" style="--stack-gap: var(--space-4)">
		<div>
			<h1 class="auth__title">Create an account</h1>
			<p class="muted">Build programs and signup calendars for your events.</p>
		</div>

		{#if form?.message && !Object.keys(form?.errors || {}).length}
			<Alert tone="danger" role="alert">{form.message}</Alert>
		{/if}

		<Form class="stack" style="--stack-gap: var(--space-4)">
			{#snippet children({ pending })}
				<input type="hidden" name="returnTo" value={data.returnTo} />
				<Field id="displayName" label="Your name" error={form?.errors?.displayName}>
					{#snippet children({ id, describedBy, invalid })}
						<Input {id} name="displayName" autocomplete="name" maxlength={LIMITS.displayNameMax} value={form?.values?.displayName || ""} {describedBy} {invalid} data-autofocus />
					{/snippet}
				</Field>
				<Field id="email" label="Email" error={form?.errors?.email}>
					{#snippet children({ id, describedBy, invalid })}
						<Input {id} name="email" type="email" autocomplete="email" value={form?.values?.email || ""} {describedBy} {invalid} />
					{/snippet}
				</Field>
				<Field id="password" label="Password" hint="At least {LIMITS.passwordMin} characters." error={form?.errors?.password}>
					{#snippet children({ id, describedBy, invalid })}
						<Input {id} name="password" type="password" autocomplete="new-password" {describedBy} {invalid} />
					{/snippet}
				</Field>
				<Button type="submit" variant="primary" block loading={pending}>Create account</Button>
			{/snippet}
		</Form>
	</div>
	<div class="card__foot" style="justify-content: center">
		<span class="muted">Already have an account? <a href="/login">Log in</a></span>
	</div>
</div>
