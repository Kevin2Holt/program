/*
	Item identity: a palette color key plus a shape (or a letter/digit glyph).
	Colors are keys, not hex values; each theme supplies a tuned value
	(tokens.css) so markers pass contrast in dark and light.
*/


export const ITEM_COLORS = ["blue", "amber", "green", "pink", "violet", "teal", "red", "sky", "lime", "orange", "brown", "slate"];
export const ITEM_SHAPES = ["circle", "triangle", "square", "diamond", "hexagon", "star"];
export const GLYPH_SHAPE = "glyph";
export const GLYPHS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"];
export const ALL_SHAPES = [...ITEM_SHAPES, GLYPH_SHAPE];


// The nth Item's default look. Colors and shapes advance together, so the
// first 12 Items all differ in color and neighbors never share a shape.
export function pickDefaultIdentity(itemIndex) {

	return {
		color: ITEM_COLORS[itemIndex % ITEM_COLORS.length],
		shape: ITEM_SHAPES[itemIndex % ITEM_SHAPES.length],
		glyph: null
	};
}

export function checkValidIdentity({ color, shape, glyph }) {

	if (!ITEM_COLORS.includes(color) || !ALL_SHAPES.includes(shape)) {
		return false;
	}
	return shape === GLYPH_SHAPE ? GLYPHS.includes(glyph) : glyph === null || glyph === undefined || glyph === "";
}
