/*
	Field validators shared by the browser (instant inline errors) and the server
	(authoritative). Each returns an error message string, or "" when valid.
*/


export const LIMITS = {
	emailMax: 254,
	passwordMin: 8,
	passwordMax: 200,
	displayNameMax: 80,
	eventNameMax: 120,
	eventCodeMin: 3,
	eventCodeMax: 32,
	personNameMax: 120,
	phoneDigitsMin: 7,
	phoneDigitsMax: 15,
	notesMax: 2000,
	itemNameMax: 120,
	ruleLabelMax: 120
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVENT_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PHONE_ALLOWED_PATTERN = /^[+\d\s().-]+$/;


export function normalizeText(value) {

	return typeof value === "string" ? value.trim() : "";
}

export function normalizeEmail(value) {

	return normalizeText(value).toLowerCase();
}

export function normalizeEventCode(value) {

	return normalizeText(value).toLowerCase();
}

export function validateEmail(value) {

	const email = normalizeEmail(value);
	if (!email) {
		return "Enter your email.";
	}
	if (email.length > LIMITS.emailMax || !EMAIL_PATTERN.test(email)) {
		return "Enter an email like name@example.com.";
	}
	return "";
}

export function validatePassword(value) {

	const password = typeof value === "string" ? value : "";
	if (password.length < LIMITS.passwordMin) {
		return `Use at least ${LIMITS.passwordMin} characters.`;
	}
	if (password.length > LIMITS.passwordMax) {
		return `Use at most ${LIMITS.passwordMax} characters.`;
	}
	return "";
}

export function validateDisplayName(value) {

	const name = normalizeText(value);
	if (!name) {
		return "Enter your name.";
	}
	if (name.length > LIMITS.displayNameMax) {
		return `Keep it under ${LIMITS.displayNameMax} characters.`;
	}
	return "";
}

export function validateEventName(value) {

	const name = normalizeText(value);
	if (!name) {
		return "Give the event a name.";
	}
	if (name.length > LIMITS.eventNameMax) {
		return `Keep it under ${LIMITS.eventNameMax} characters.`;
	}
	return "";
}

export function validateEventCodeShape(value) {

	const code = normalizeEventCode(value);
	if (!code) {
		return "Choose a short link.";
	}
	if (code.length < LIMITS.eventCodeMin || code.length > LIMITS.eventCodeMax) {
		return `Use ${LIMITS.eventCodeMin}–${LIMITS.eventCodeMax} characters.`;
	}
	if (!EVENT_CODE_PATTERN.test(code)) {
		return "Use lowercase letters, numbers, and single hyphens (not at the start or end).";
	}
	return "";
}

export function countPhoneDigits(value) {

	return normalizeText(value).replace(/\D/g, "").length;
}

export function validatePhone(value) {

	const phone = normalizeText(value);
	const digits = countPhoneDigits(phone);
	if (!PHONE_ALLOWED_PATTERN.test(phone) || digits < LIMITS.phoneDigitsMin || digits > LIMITS.phoneDigitsMax) {
		return "Enter a full phone number, like 801-555-0123.";
	}
	return "";
}
