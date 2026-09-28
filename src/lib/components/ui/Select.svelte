<script>
	/*
		Custom select (listbox popover). With searchable, it becomes a combobox with
		a filter box (used for time zones). Keyboard: arrows, Home/End, Enter,
		Escape, and type-to-jump. options: [{ value, label, meta?, marker? }]
		where marker is { color, shape, glyph } for Item options.
	*/
	import { tick } from "svelte";
	import Icon from "./Icon.svelte";
	import ItemMarker from "./ItemMarker.svelte";
	import { dismissable, placePopover } from "./floating.js";

	const TYPEAHEAD_RESET_MS = 600;

	let {
		value = $bindable(),
		options,
		placeholder = "Choose…",
		id: idProp = undefined,
		labelledBy = undefined,
		label = undefined,
		describedBy = undefined,
		invalid = false,
		disabled = false,
		searchable = false,
		searchPlaceholder = "Search",
		size = "md",
		class: className = "",
		onchange = undefined
	} = $props();

	const uid = $props.id();
	let id = $derived(idProp || `select-${uid}`);
	let listboxId = $derived(`${id}-listbox`);
	let open = $state(false);
	let query = $state("");
	let activeIndex = $state(-1);
	let triggerEl = $state();
	let listEl = $state();
	let searchEl = $state();
	let typeahead = "";
	let typeaheadTimer = null;

	let selected = $derived(options.find((option) => option.value === value));
	let visibleOptions = $derived(searchable && query.trim()
		? options.filter((option) => `${option.label} ${option.meta || ""}`.toLowerCase().includes(query.trim().toLowerCase()))
		: options);


	function findOptionId(index) {

		return `${id}-opt-${index}`;
	}

	async function openList() {

		if (disabled) {
			return;
		}
		open = true;
		query = "";
		activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
		await tick();
		(searchable ? searchEl : listEl)?.focus();
		scrollActiveIntoView();
	}

	function closeList(returnFocus = true) {

		open = false;
		if (returnFocus) {
			triggerEl?.focus();
		}
	}

	function chooseOption(option) {

		if (option.value !== value) {
			value = option.value;
			onchange?.(option.value);
		}
		closeList();
	}

	async function scrollActiveIntoView() {

		await tick();
		document.getElementById(findOptionId(activeIndex))?.scrollIntoView({ block: "nearest" });
	}

	function moveActive(nextIndex) {

		if (!visibleOptions.length) {
			return;
		}
		activeIndex = Math.max(0, Math.min(visibleOptions.length - 1, nextIndex));
		scrollActiveIntoView();
	}

	function jumpByTypeahead(character) {

		clearTimeout(typeaheadTimer);
		typeahead += character.toLowerCase();
		typeaheadTimer = setTimeout(() => {
			typeahead = "";
		}, TYPEAHEAD_RESET_MS);
		const match = visibleOptions.findIndex((option) => option.label.toLowerCase().startsWith(typeahead));
		if (match >= 0) {
			moveActive(match);
		}
	}

	function handleListKeydown(event) {

		if (event.key === "ArrowDown") {
			event.preventDefault();
			moveActive(activeIndex + 1);
		}
		else if (event.key === "ArrowUp") {
			event.preventDefault();
			moveActive(activeIndex - 1);
		}
		else if (event.key === "Home") {
			event.preventDefault();
			moveActive(0);
		}
		else if (event.key === "End") {
			event.preventDefault();
			moveActive(visibleOptions.length - 1);
		}
		else if (event.key === "Enter" || (event.key === " " && !searchable)) {
			event.preventDefault();
			if (visibleOptions[activeIndex]) {
				chooseOption(visibleOptions[activeIndex]);
			}
		}
		else if (event.key === "Tab") {
			closeList(false);
		}
		else if (!searchable && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
			jumpByTypeahead(event.key);
		}
	}

	function handleTriggerKeydown(event) {

		if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
			event.preventDefault();
			openList();
		}
	}
</script>

<div
	class="select {className}"
	use:dismissable={(reason) => {
		if (open) {
			closeList(reason === "escape");
		}
	}}
>
	<button
		bind:this={triggerEl}
		{id}
		class="select-trigger"
		class:select-trigger--sm={size === "sm"}
		type="button"
		{disabled}
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-controls={open ? listboxId : undefined}
		aria-labelledby={labelledBy ? `${labelledBy} ${id}` : undefined}
		aria-label={labelledBy ? undefined : label}
		aria-describedby={describedBy}
		data-invalid={invalid || undefined}
		onclick={() => (open ? closeList() : openList())}
		onkeydown={handleTriggerKeydown}
	>
		<span class="select-trigger__value" class:is-placeholder={!selected}>
			{#if selected?.marker}<ItemMarker {...selected.marker} />{/if}
			{selected ? selected.label : placeholder}
			{#if selected?.meta}<span class="subtle">· {selected.meta}</span>{/if}
		</span>
		<Icon name="chev-down" class="icon--chev" />
	</button>

	{#if open}
		<div class="popover" use:placePopover>
			{#if searchable}
				<div class="combobox__search">
					<div class="input-affix">
						<Icon name="search" class="input-affix__icon" />
						<input
							bind:this={searchEl}
							bind:value={query}
							class="input"
							type="text"
							placeholder={searchPlaceholder}
							aria-label={searchPlaceholder}
							role="combobox"
							aria-expanded="true"
							aria-controls={listboxId}
							aria-autocomplete="list"
							aria-activedescendant={visibleOptions[activeIndex] ? findOptionId(activeIndex) : undefined}
							oninput={() => {
								activeIndex = 0;
							}}
							onkeydown={handleListKeydown}
						/>
					</div>
				</div>
			{/if}
			<ul
				bind:this={listEl}
				id={listboxId}
				class="listbox"
				role="listbox"
				tabindex={searchable ? undefined : -1}
				aria-labelledby={labelledBy}
				aria-label={labelledBy ? undefined : label}
				aria-activedescendant={!searchable && visibleOptions[activeIndex] ? findOptionId(activeIndex) : undefined}
				onkeydown={searchable ? undefined : handleListKeydown}
			>
				{#each visibleOptions as option, index (option.value)}
					<!-- Keyboard selection is handled by the listbox (arrows + Enter). -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<li
						id={findOptionId(index)}
						class="option"
						class:is-active={index === activeIndex}
						role="option"
						aria-selected={option.value === value}
						onclick={() => chooseOption(option)}
						onpointermove={() => {
							activeIndex = index;
						}}
					>
						{#if option.marker}<ItemMarker {...option.marker} />{/if}
						<span class="option__label">{option.label}</span>
						{#if option.meta}<span class="option__meta">{option.meta}</span>{/if}
						<Icon name="check" class="option__check" />
					</li>
				{:else}
					<li class="option subtle" role="presentation">No matches</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
