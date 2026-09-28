<script>
	import Topbar from "$lib/components/app/Topbar.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Field from "$lib/components/ui/Field.svelte";
	import Form from "$lib/components/ui/Form.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import Segmented from "$lib/components/ui/Segmented.svelte";
	import { showToast } from "$lib/components/ui/toast.svelte.js";
	import { LIMITS } from "$lib/validation.js";

	const THEME_COOKIE = "progr_theme";
	const ONE_YEAR_S = 365 * 24 * 60 * 60;

	let { data, form } = $props();
	let theme = $derived(data.theme);
	// Action results differ per form; read them loosely.
	let result = $derived(/** @type {any} */ (form));


	function applyTheme(next) {

		document.documentElement.dataset.theme = next;
		document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_S}; samesite=lax`;
	}
</script>

<svelte:head><title>Account · progr.am</title></svelte:head>

<Topbar crumbs={[{ label: "Account" }]} />

<div class="content" style="max-width: 48rem">
	<div class="page-head">
		<div>
			<h1 class="page-head__title">Account</h1>
			<p class="page-head__sub">Your profile, password, and appearance.</p>
		</div>
	</div>

	<div class="stack" style="--stack-gap: var(--space-4)">
		<section class="card" aria-labelledby="profile-h">
			<div class="card__head"><h2 class="card__title" id="profile-h">Profile</h2></div>
			<Form action="?/profile" onsuccess={() => showToast("Profile saved")}>
				{#snippet children({ pending })}
					<div class="card__body form-grid">
						<Field id="displayName" label="Name" error={result?.profile?.errors?.displayName}>
							{#snippet children({ id, describedBy, invalid })}
								<Input {id} name="displayName" autocomplete="name" maxlength={LIMITS.displayNameMax} value={result?.profile?.values?.displayName ?? data.user.displayName} {describedBy} {invalid} />
							{/snippet}
						</Field>
						<Field id="email" label="Email" error={result?.profile?.errors?.email}>
							{#snippet children({ id, describedBy, invalid })}
								<Input {id} name="email" type="email" autocomplete="email" value={result?.profile?.values?.email ?? data.user.email} {describedBy} {invalid} />
							{/snippet}
						</Field>
					</div>
					<div class="card__foot">
						<Button type="submit" variant="primary" loading={pending}>Save profile</Button>
					</div>
				{/snippet}
			</Form>
		</section>

		<section class="card" aria-labelledby="password-h">
			<div class="card__head">
				<div>
					<h2 class="card__title" id="password-h">Password</h2>
					<p class="card__desc">Changing it signs you out everywhere else.</p>
				</div>
			</div>
			<Form action="?/password" reset onsuccess={() => showToast("Password changed")}>
				{#snippet children({ pending })}
					<div class="card__body form-grid">
						<Field id="currentPassword" label="Current password" class="span-all" error={result?.password?.errors?.currentPassword}>
							{#snippet children({ id, describedBy, invalid })}
								<Input {id} name="currentPassword" type="password" autocomplete="current-password" {describedBy} {invalid} />
							{/snippet}
						</Field>
						<Field id="newPassword" label="New password" hint="At least {LIMITS.passwordMin} characters." error={result?.password?.errors?.newPassword}>
							{#snippet children({ id, describedBy, invalid })}
								<Input {id} name="newPassword" type="password" autocomplete="new-password" {describedBy} {invalid} />
							{/snippet}
						</Field>
						<Field id="confirmPassword" label="Confirm new password" error={result?.password?.errors?.confirmPassword}>
							{#snippet children({ id, describedBy, invalid })}
								<Input {id} name="confirmPassword" type="password" autocomplete="new-password" {describedBy} {invalid} />
							{/snippet}
						</Field>
					</div>
					<div class="card__foot">
						<Button type="submit" variant="primary" loading={pending}>Change password</Button>
					</div>
				{/snippet}
			</Form>
		</section>

		<section class="card" aria-labelledby="appearance-h">
			<div class="card__head"><h2 class="card__title" id="appearance-h">Appearance</h2></div>
			<div class="settings-row">
				<div>
					<div class="settings-row__label" id="theme-label">Theme</div>
					<div class="settings-row__desc">Dark is the default. Saved on this device.</div>
				</div>
				<div>
					<Segmented
						bind:value={theme}
						labelledBy="theme-label"
						options={[{ value: "dark", label: "Dark", icon: "moon" }, { value: "light", label: "Light", icon: "sun" }]}
						onchange={applyTheme}
					/>
				</div>
			</div>
		</section>
	</div>
</div>
