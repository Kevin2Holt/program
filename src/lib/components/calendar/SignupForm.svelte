<script>
	/* The structured signup form. Which fields appear, and which are required, comes from setup. */
	import ChoiceCards from "../ui/ChoiceCards.svelte";
	import Field from "../ui/Field.svelte";
	import Input from "../ui/Input.svelte";
	import Textarea from "../ui/Textarea.svelte";
	import Icon from "../ui/Icon.svelte";
	import { LIMITS } from "$lib/validation.js";

	let { formFields, values = $bindable(), errors = {} } = $props();
</script>

<Field id="signup-name" label="Name" required error={errors.name}>
	{#snippet children({ id, describedBy, invalid })}
		<Input {id} bind:value={values.name} autocomplete="name" maxlength={LIMITS.personNameMax} {describedBy} {invalid} />
	{/snippet}
</Field>

{#if formFields.phone.on}
	<Field id="signup-phone" label="Phone" required={formFields.phone.required} optional={!formFields.phone.required} error={errors.phone}>
		{#snippet children({ id, describedBy, invalid })}
			<Input {id} bind:value={values.phone} type="tel" inputmode="tel" autocomplete="tel" {describedBy} {invalid} />
		{/snippet}
	</Field>
	{#if formFields.contactMethod.on}
		<div class="field" class:has-error={errors.contactMethod}>
			<span class="label" id="signup-contact">How should they reach you?{#if formFields.contactMethod.required}<span class="label__req" aria-hidden="true">*</span>{/if}</span>
			<ChoiceCards bind:value={values.contactMethod} labelledBy="signup-contact" options={[{ value: "text", label: "Text", icon: "message" }, { value: "call", label: "Call", icon: "phone" }]} />
			{#if errors.contactMethod}<span class="error-msg" role="alert"><Icon name="alert-circle" />{errors.contactMethod}</span>{/if}
		</div>
	{/if}
	{#if formFields.numberType.on}
		<div class="field" class:has-error={errors.numberType}>
			<span class="label" id="signup-number-type">Number type{#if formFields.numberType.required}<span class="label__req" aria-hidden="true">*</span>{/if}</span>
			<ChoiceCards bind:value={values.numberType} labelledBy="signup-number-type" options={[{ value: "cell", label: "Cell", icon: "phoneDevice" }, { value: "whatsapp", label: "WhatsApp", icon: "message-circle" }]} />
			{#if errors.numberType}<span class="error-msg" role="alert"><Icon name="alert-circle" />{errors.numberType}</span>{/if}
		</div>
	{/if}
{/if}

{#if formFields.email.on}
	<Field id="signup-email" label="Email" required={formFields.email.required} optional={!formFields.email.required} error={errors.email}>
		{#snippet children({ id, describedBy, invalid })}
			<Input {id} bind:value={values.email} type="email" autocomplete="email" placeholder="you@example.com" {describedBy} {invalid} />
		{/snippet}
	</Field>
{/if}

{#if formFields.notes.on}
	<Field id="signup-notes" label="Notes" required={formFields.notes.required} optional={!formFields.notes.required} error={errors.notes}>
		{#snippet children({ id, describedBy, invalid })}
			<Textarea {id} bind:value={values.notes} maxlength={LIMITS.notesMax} placeholder="Anything they should know" {describedBy} {invalid} />
		{/snippet}
	</Field>
{/if}
