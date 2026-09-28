<script>
	/*
		Time input: type a time ("5:30 pm", "17:30", "5p") or pick from a list of
		times. value is "HH:MM" (24-hour) or "". Unreadable text reverts on blur.
	*/
	import { tick } from "svelte";
	import { dismissable, placePopover } from "./floating.js";
	import { formatTime12, listTimesByStep, parseTimeText } from "$lib/times.js";

	const SUGGESTION_STEP_MINUTES = 15;
	const TIME_SUGGESTIONS = listTimesByStep(SUGGESTION_STEP_MINUTES);
	const DEFAULT_SCROLL_TIME = "09:00";

	let {
		value = $bindable(""),
		id: idProp = undefined,
		label = undefined,
		describedBy = undefined,
		invalid = false,
		placeholder = "e.g. 5:30 pm",
		width = "7.5rem",
		onchange = undefined
	} = $props();

	const uid = $props.id();
	let id = $derived(idProp || `time-${uid}`);
	let listboxId = $derived(`${id}-listbox`);
	// Follows value, but can be typed into freely until committed.
	let text = $derived(value ? formatTime12(value) : "");
	let open = $state(false);
	let activeIndex = $state(-1);
	let listEl = $state();


	function commitText() {

		const parsed = parseTimeText(text);
		if (parsed && parsed !== value) {
			value = parsed;
			onchange?.(parsed);
		}
		text = value ? formatTime12(value) : "";
	}

	function chooseTime(time) {

		text = formatTime12(time);
		commitText();
		open = false;
	}

	async function openList() {

		open = true;
		const target = parseTimeText(text) || value || DEFAULT_SCROLL_TIME;
		activeIndex = Math.max(0, TIME_SUGGESTIONS.findIndex((time) => time >= target));
		await tick();
		listEl?.children[activeIndex]?.scrollIntoView({ block: "center" });
	}

	function handleKeydown(event) {

		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			if (!open) {
				openList();
				return;
			}
			activeIndex = Math.max(0, Math.min(TIME_SUGGESTIONS.length - 1, activeIndex + (event.key === "ArrowDown" ? 1 : -1)));
			listEl?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
		}
		else if (event.key === "Enter") {
			event.preventDefault();
			if (open && activeIndex >= 0) {
				chooseTime(TIME_SUGGESTIONS[activeIndex]);
			}
			else {
				commitText();
			}
		}
		else if (event.key === "Escape" && open) {
			event.stopPropagation();
			open = false;
		}
		else if (event.key === "Tab") {
			open = false;
		}
	}
</script>

<div
	class="select"
	style:width
	use:dismissable={() => {
		open = false;
	}}
>
	<input
		{id}
		class="input tabular"
		type="text"
		autocomplete="off"
		role="combobox"
		aria-expanded={open}
		aria-controls={listboxId}
		aria-autocomplete="list"
		aria-activedescendant={open && activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined}
		aria-label={label}
		aria-describedby={describedBy}
		aria-invalid={invalid || undefined}
		{placeholder}
		bind:value={text}
		onfocus={openList}
		onblur={commitText}
		onkeydown={handleKeydown}
	/>
	{#if open}
		<div class="popover" use:placePopover>
			<ul bind:this={listEl} id={listboxId} class="listbox" role="listbox" aria-label="Times">
				{#each TIME_SUGGESTIONS as time, index (time)}
					<li
						id="{id}-opt-{index}"
						class="option tabular"
						class:is-active={index === activeIndex}
						role="option"
						aria-selected={time === value}
						onpointerdown={(event) => {
							event.preventDefault();
							chooseTime(time);
						}}
					>{formatTime12(time)}</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
