/*
	Service results. Services return these instead of throwing for expected
	outcomes (validation errors, conflicts, not found), so callers can show a
	field-level message. Throwing is reserved for genuine faults.

	Shape: { ok: true, value } | { ok: false, code, message, errors }
	errors maps a field name to its message, for inline display.
*/


export const RESULT_CODE = {
	invalid: "invalid",	// input failed validation; see errors
	notFound: "not_found",
	forbidden: "forbidden",
	conflict: "conflict",	// state changed or a uniqueness rule failed
	rateLimited: "rate_limited"
};


export function succeed(value = null) {

	return { ok: true, value };
}

export function fail(code, message, errors = {}) {

	return { ok: false, code, message, errors };
}

export function failInvalid(errors, message = "Please fix the highlighted fields.") {

	return fail(RESULT_CODE.invalid, message, errors);
}

export function checkHasErrors(errors) {

	return Object.keys(errors).length > 0;
}
