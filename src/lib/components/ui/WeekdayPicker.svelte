<script>
	/* Pick weekdays (0 = Sunday … 6 = Saturday). value is a sorted array of numbers. */
	const WEEKDAYS = [
		{ day: 0, short: "S", name: "Sunday" },
		{ day: 1, short: "M", name: "Monday" },
		{ day: 2, short: "T", name: "Tuesday" },
		{ day: 3, short: "W", name: "Wednesday" },
		{ day: 4, short: "T", name: "Thursday" },
		{ day: 5, short: "F", name: "Friday" },
		{ day: 6, short: "S", name: "Saturday" }
	];

	let { value = $bindable([]), labelledBy = undefined, describedBy = undefined } = $props();


	function toggleWeekday(day) {

		value = value.includes(day) ? value.filter((existing) => existing !== day) : [...value, day].sort((a, b) => a - b);
	}
</script>

<div class="weekdays" role="group" aria-labelledby={labelledBy} aria-describedby={describedBy}>
	{#each WEEKDAYS as weekday (weekday.day)}
		<button
			class="weekday"
			type="button"
			aria-pressed={value.includes(weekday.day)}
			aria-label={weekday.name}
			onclick={() => toggleWeekday(weekday.day)}
		>{weekday.short}</button>
	{/each}
</div>
