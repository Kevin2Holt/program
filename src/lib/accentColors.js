/*
	Accent colors an event can use on its public pages. A fixed, curated list
	instead of a free color picker, so every choice meets WCAG AA in both themes
	(white on the button color, accent text on page and tinted surfaces).
	The token values live in src/lib/styles/tokens.css under [data-accent="…"].
*/


export const DEFAULT_ACCENT = "indigo";

export const ACCENT_COLORS = [
	{ value: "indigo", label: "Indigo" },
	{ value: "blue", label: "Blue" },
	{ value: "teal", label: "Teal" },
	{ value: "green", label: "Green" },
	{ value: "amber", label: "Amber" },
	{ value: "red", label: "Red" },
	{ value: "pink", label: "Pink" },
	{ value: "violet", label: "Violet" },
	{ value: "slate", label: "Slate" }
];


export function checkValidAccent(value) {

	return ACCENT_COLORS.some((color) => color.value === value);
}
