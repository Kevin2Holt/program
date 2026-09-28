<script>
	import { invalidateAll } from "$app/navigation";
	import { page } from "$app/state";
	import Topbar from "$lib/components/app/Topbar.svelte";
	import RuleDrawer from "$lib/components/calendar/RuleDrawer.svelte";
	import Badge from "$lib/components/ui/Badge.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import ItemMarker from "$lib/components/ui/ItemMarker.svelte";
	import Segmented from "$lib/components/ui/Segmented.svelte";
	import Switch from "$lib/components/ui/Switch.svelte";
	import { confirmAction } from "$lib/components/ui/confirm.svelte.js";
	import { showErrorToast, showToast } from "$lib/components/ui/toast.svelte.js";
	import { sendJson } from "$lib/api.js";
	import { describeRuleSchedule, describeRuleTitle } from "$lib/calendar/describeRule.js";

	let { data } = $props();

	let filter = $state("all");
	let drawerOpen = $state(false);
	let editingRule = $state(null);

	let itemsById = $derived(Object.fromEntries(data.allItems.map((item) => [item.id, item])));
	let visibleRules = $derived(data.rules.filter((rule) => filter === "all" || rule.effect === filter));
	let counts = $derived({ allow: data.rules.filter((rule) => rule.effect === "allow").length, block: data.rules.filter((rule) => rule.effect === "block").length });


	function openDrawer(rule = null) {

		editingRule = rule;
		drawerOpen = true;
	}

	async function setActive(rule, active) {

		const result = await sendJson("POST", `/api/events/${data.event.id}/calendar/rules/${rule.id}`, page.data.csrfToken, { active });
		if (!result.ok) {
			showErrorToast(result.message);
			await invalidateAll();
			return;
		}
		await invalidateAll();
		showToast(active ? "Rule activated" : "Rule deactivated", { icon: active ? "check" : "power" });
	}

	async function deleteRule(rule) {

		const confirmed = await confirmAction({
			title: "Delete this rule?",
			message: `“${describeRuleTitle(rule)}” will be deleted for good. Dates it closed will open again unless another rule closes them. To keep it for later, turn it off instead.`,
			confirmLabel: "Delete rule"
		});
		if (!confirmed) {
			return;
		}
		const result = await sendJson("DELETE", `/api/events/${data.event.id}/calendar/rules/${rule.id}`, page.data.csrfToken);
		if (!result.ok) {
			showErrorToast(result.message);
			return;
		}
		await invalidateAll();
		showToast("Rule deleted", { icon: "trash" });
	}
</script>

<svelte:head><title>Availability · {data.event.name}</title></svelte:head>

<Topbar crumbs={[{ label: data.event.name, href: `/events/${data.event.id}/program` }, { label: "Calendar", href: `/events/${data.event.id}/calendar` }, { label: "Availability" }]} />

<div class="content" style="max-width: 60rem">
	<div class="page-head">
		<div>
			<h1 class="page-head__title">Availability</h1>
			<p class="page-head__sub">Allow rules open dates; Block rules close them. One-date rules override repeating ones.</p>
		</div>
		{#if data.rules.length}
			<Button variant="primary" icon="plus" onclick={() => openDrawer()}>Add rule</Button>
		{/if}
	</div>

	{#if !data.rules.length}
		<EmptyState icon="shield-check" title="Every day in the window is open" text="Add rules to close days (like a weekly day off or a holiday) or to open Items only on certain days.">
			<Button variant="primary" icon="plus" onclick={() => openDrawer()}>Add rule</Button>
		</EmptyState>
	{:else}
		<div class="toolbar">
			<Segmented bind:value={filter} label="Show rules" options={[{ value: "all", label: "All", count: data.rules.length }, { value: "allow", label: "Allow", count: counts.allow }, { value: "block", label: "Block", count: counts.block }]} />
		</div>

		<div class="card rule-list">
			{#each visibleRules as rule (rule.id)}
				<div class="rule" class:is-inactive={!rule.active}>
					<span class="rule__kind rule__kind--{rule.effect}" title={rule.effect === "allow" ? "Allow" : "Block"}><Icon name={rule.effect === "allow" ? "shield-check" : "ban"} /></span>
					<div class="rule__main">
						<div class="rule__title">
							<button class="link-button rule__edit" type="button" onclick={() => openDrawer(rule)}>{describeRuleTitle(rule)}</button>
							{#if !rule.active}<Badge>Inactive</Badge>{/if}
						</div>
						<div class="rule__meta">
							<span class="row" style="--row-gap: 4px"><Icon name={rule.kind === "once" ? "calendar" : "repeat"} />{describeRuleSchedule(rule)}</span>
							{#if rule.appliesTo === "all"}
								<span>All items</span>
							{:else}
								{#each rule.itemIds as itemId (itemId)}
									{#if itemsById[itemId]}<span class="item-chip" class:is-archived={itemsById[itemId].archived}><ItemMarker {...itemsById[itemId]} size="sm" />{itemsById[itemId].name}</span>{/if}
								{/each}
							{/if}
							{#if rule.label}<span>{rule.label}</span>{/if}
						</div>
					</div>
					<div class="rule__actions">
						<Switch checked={rule.active} label="{rule.active ? "Deactivate" : "Activate"} {describeRuleTitle(rule)}" labelHidden onchange={(checked) => setActive(rule, checked)} />
						<Button variant="ghost" size="sm" icon="pencil" label="Edit rule" onclick={() => openDrawer(rule)} />
						<Button variant="dangerQuiet" size="sm" icon="trash" label="Delete rule" onclick={() => deleteRule(rule)} />
					</div>
				</div>
			{:else}
				<div class="card__body"><p class="muted">No {filter} rules.</p></div>
			{/each}
		</div>
	{/if}
</div>

<RuleDrawer
	bind:open={drawerOpen}
	rule={editingRule}
	items={data.items}
	eventId={data.event.id}
	todayDate={data.today}
	onsaved={async (message) => {
		await invalidateAll();
		showToast(message);
	}}
/>
