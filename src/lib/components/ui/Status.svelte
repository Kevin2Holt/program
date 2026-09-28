<script>
	/*
		Organizer availability status. Each status has its own fill pattern as well
		as color, so it never depends on color alone.
	*/
	const STATUS_LABELS = {
		available: "Available",
		full: "Full",
		blocked: "Blocked",
		out: "Out of window",
		archived: "Archived"
	};

	let { status, label = "", title = undefined } = $props();
</script>

<span class="status status--{status}" {title}>{label || STATUS_LABELS[status]}</span>
