/*
	Program block types. Shared by the editor (defaults, labels) and the server
	(normalizing content before storage). Adding a block type means adding an
	entry here, a renderer in ProgramView, an editor component, and the type in
	the program_blocks check constraint.
	Deferred: columns ({ columns: [{ blockOrder }] } within one version).
*/


export const BLOCK_LIMITS = {
	labelMax: 120,
	valueMax: 500,
	rowsMax: 100,
	textDocBytesMax: 100000,
	headerFieldMax: 120
};

export const SEPARATOR_VARIANTS = ["line", "space"];
export const HEADER_FIELDS = ["eyebrow", "title", "date", "time", "place"];

let rowIdCounter = 0;


export function createRowId() {

	rowIdCounter += 1;
	return `r${Date.now().toString(36)}${rowIdCounter.toString(36)}`;
}

function trimTo(value, max) {

	return (typeof value === "string" ? value : "").trim().slice(0, max);
}

function normalizeLabelValueContent(content) {

	const rows = Array.isArray(content?.rows) ? content.rows.slice(0, BLOCK_LIMITS.rowsMax) : [];
	return {
		rows: rows.map((row) => ({
			id: trimTo(row?.id, BLOCK_LIMITS.labelMax) || createRowId(),
			label: trimTo(row?.label, BLOCK_LIMITS.labelMax),
			value: trimTo(row?.value, BLOCK_LIMITS.valueMax)
		}))
	};
}

function normalizeSeparatorContent(content) {

	return { variant: SEPARATOR_VARIANTS.includes(content?.variant) ? content.variant : "line" };
}

function normalizeTextContent(content) {

	const doc = content?.doc && typeof content.doc === "object" ? content.doc : { type: "doc", content: [{ type: "paragraph" }] };
	return { doc };
}


export const BLOCK_TYPES = {
	text: {
		label: "Text",
		icon: "type",
		description: "Paragraphs, headings, lists",
		createDefaultContent: () => ({ doc: { type: "doc", content: [{ type: "paragraph" }] } }),
		normalizeContent: normalizeTextContent
	},
	label_value: {
		label: "Label / value",
		icon: "rows",
		description: "Who does what",
		createDefaultContent: () => ({ rows: [{ id: createRowId(), label: "", value: "" }] }),
		normalizeContent: normalizeLabelValueContent
	},
	separator: {
		label: "Separator",
		icon: "separator",
		description: "Line or space",
		createDefaultContent: () => ({ variant: "line" }),
		normalizeContent: normalizeSeparatorContent
	}
};

export const BLOCK_TYPE_NAMES = Object.keys(BLOCK_TYPES);


export function checkBlockType(type) {

	return Object.hasOwn(BLOCK_TYPES, type);
}

export function normalizeHeader(header) {

	const normalized = {};
	for (const field of HEADER_FIELDS) {
		normalized[field] = trimTo(header?.[field], BLOCK_LIMITS.headerFieldMax);
	}
	return normalized;
}
