/*
	The structured signup form (not a form builder). Name is always asked and
	required. The phone-related fields only exist when phone is on.
*/


export const FORM_FIELD_KEYS = ["phone", "contactMethod", "numberType", "email", "notes"];
export const PHONE_DEPENDENT_FIELDS = ["contactMethod", "numberType"];

export const FORM_FIELD_LABELS = {
	phone: "Phone",
	contactMethod: "Call or text",
	numberType: "Cell or WhatsApp",
	email: "Email",
	notes: "Notes"
};

export const DEFAULT_FORM_FIELDS = {
	phone: { on: true, required: true },
	contactMethod: { on: true, required: false },
	numberType: { on: true, required: false },
	email: { on: false, required: false },
	notes: { on: true, required: false }
};


export function normalizeFormFields(raw) {

	const fields = {};
	for (const key of FORM_FIELD_KEYS) {
		const source = raw?.[key] || DEFAULT_FORM_FIELDS[key];
		const on = Boolean(source.on);
		fields[key] = { on, required: on && Boolean(source.required) };
	}
	if (!fields.phone.on) {
		for (const key of PHONE_DEPENDENT_FIELDS) {
			fields[key] = { on: false, required: false };
		}
	}
	return fields;
}
