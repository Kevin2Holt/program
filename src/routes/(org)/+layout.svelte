<script>
	/*
		Organizer shell. Inside an event (page.data.event is set by the event
		layout), the sidebar shows the event switcher and the event's sections.
	*/
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import OrganizerShell from "$lib/components/app/OrganizerShell.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import Menu from "$lib/components/ui/Menu.svelte";

	let { data, children } = $props();

	let currentEvent = $derived(page.data.event);
	let sections = $derived(buildSections(currentEvent, page.data.navCounts));


	function buildSections(event, counts = {}) {

		/** @type {{ label?: string, links: { href: string, label: string, icon: string, exact?: boolean, count?: number }[] }[]} */
		const sectionList = [{ links: [{ href: "/dashboard", label: "All events", icon: "home", exact: true }] }];
		if (!event) {
			return sectionList;
		}
		const base = `/events/${event.id}`;
		sectionList.push({
			label: "Event",
			links: [
				{ href: `${base}/program`, label: "Program", icon: "file" },
				{ href: `${base}/settings`, label: "Event settings", icon: "sliders" }
			]
		});
		if (page.data.calendarNav) {
			sectionList.push({ label: "Calendar", links: page.data.calendarNav.map((link) => ({ ...link, count: counts[link.key] })) });
		}
		return sectionList;
	}
</script>

<OrganizerShell user={data.user} {sections}>
	{#snippet eventSwitcher()}
		{#if currentEvent}
			<div class="event-switch-wrap">
				<div class="event-switch">
					<span class="grow" style="min-width: 0">
						<span class="event-switch__name">{currentEvent.name}</span><br />
						<span class="event-switch__code">{data.publicHost}/{currentEvent.code}</span>
					</span>
					<Menu
						label="Switch event"
						icon="chev-updown"
						width="15rem"
						items={[
							...data.memberEvents.filter((event) => event.id !== currentEvent.id && !event.archived).map((event) => ({
								label: event.name,
								icon: "file",
								onselect: () => goto(`/events/${event.id}/program`)
							})),
							{ label: "All events", icon: "home", onselect: () => goto("/dashboard") }
						]}
					/>
				</div>
				{#if currentEvent.archived}
					<p class="hint row" style="--row-gap: var(--space-1); padding: 0 var(--space-2) var(--space-2)"><Icon name="archive" />Archived</p>
				{/if}
			</div>
		{/if}
	{/snippet}
	{@render children()}
</OrganizerShell>
