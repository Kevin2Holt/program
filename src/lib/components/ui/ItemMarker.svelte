<script>
	/* An Item's identity: palette color plus shape (or a letter/digit glyph). */
	let { color, shape, glyph = "", size = "md", label = "" } = $props();
</script>

<span
	class="marker"
	class:marker--sm={size === "sm"}
	class:marker--lg={size === "lg"}
	class:marker--xl={size === "xl"}
	data-color={color}
	data-shape={shape}
	role={label ? "img" : undefined}
	aria-label={label || undefined}
	aria-hidden={label ? undefined : "true"}
>{shape === "glyph" ? glyph : ""}</span>
