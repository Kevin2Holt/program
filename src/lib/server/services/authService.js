/*
	Account rules: sign up, log in, and account changes. Validation lives here;
	routes only pass input through and render results.
*/
import { checkHasErrors, fail, failInvalid, RESULT_CODE, succeed } from "$lib/result.js";
import { normalizeEmail, normalizeText, validateDisplayName, validateEmail, validatePassword } from "$lib/validation.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { PG_ERROR } from "../db.js";
import { checkEmailTaken, findPasswordHashByUserId, findUserWithHashByEmail, insertUser, updateUserPasswordHash, updateUserProfile } from "../data/users.js";


const LOGIN_FAILED_MESSAGE = "That email and password don't match an account.";
// Hash used when no user matches, so a failed login takes the same time either way.
let dummyHashPromise = null;


function collectErrors(checks) {

	const errors = {};
	for (const [field, message] of Object.entries(checks)) {
		if (message) {
			errors[field] = message;
		}
	}
	return errors;
}

function getDummyHash() {

	dummyHashPromise ||= hashPassword("not-a-real-password");
	return dummyHashPromise;
}

function toPublicUser(row) {

	return { id: row.id, email: row.email, displayName: row.display_name };
}


export async function signUpUser(input) {

	const email = normalizeEmail(input.email);
	const displayName = normalizeText(input.displayName);
	const errors = collectErrors({
		displayName: validateDisplayName(displayName),
		email: validateEmail(email),
		password: validatePassword(input.password)
	});
	if (!errors.email && await checkEmailTaken(email)) {
		errors.email = "An account with this email already exists. Try logging in.";
	}
	if (checkHasErrors(errors)) {
		return failInvalid(errors);
	}

	const passwordHash = await hashPassword(input.password);
	try {
		return succeed(toPublicUser(await insertUser({ email, displayName, passwordHash })));
	}
	catch (err) {
		// Two signups racing for one email: the unique index decides.
		if (err.code === PG_ERROR.uniqueViolation) {
			return failInvalid({ email: "An account with this email already exists. Try logging in." });
		}
		throw err;
	}
}

export async function logInUser(input) {

	const email = normalizeEmail(input.email);
	const password = typeof input.password === "string" ? input.password : "";
	if (!email || !password) {
		return failInvalid(collectErrors({
			email: email ? "" : "Enter your email.",
			password: password ? "" : "Enter your password."
		}));
	}

	const user = await findUserWithHashByEmail(email);
	const matches = await verifyPassword(password, user ? user.password_hash : await getDummyHash());
	if (!user || !matches) {
		return fail(RESULT_CODE.invalid, LOGIN_FAILED_MESSAGE, {});
	}
	return succeed(toPublicUser(user));
}

export async function updateAccountProfile(userId, input) {

	const email = normalizeEmail(input.email);
	const displayName = normalizeText(input.displayName);
	const errors = collectErrors({
		displayName: validateDisplayName(displayName),
		email: validateEmail(email)
	});
	if (!errors.email && await checkEmailTaken(email, userId)) {
		errors.email = "Another account already uses this email.";
	}
	if (checkHasErrors(errors)) {
		return failInvalid(errors);
	}
	return succeed(toPublicUser(await updateUserProfile(userId, { email, displayName })));
}

export async function changeAccountPassword(userId, input) {

	const errors = collectErrors({
		currentPassword: input.currentPassword ? "" : "Enter your current password.",
		newPassword: validatePassword(input.newPassword)
	});
	if (!errors.newPassword && input.newPassword !== input.confirmPassword) {
		errors.confirmPassword = "The passwords don't match.";
	}
	if (checkHasErrors(errors)) {
		return failInvalid(errors);
	}

	const storedHash = await findPasswordHashByUserId(userId);
	if (!storedHash || !await verifyPassword(input.currentPassword, storedHash)) {
		return failInvalid({ currentPassword: "That isn't your current password." });
	}
	await updateUserPasswordHash(userId, await hashPassword(input.newPassword));
	return succeed();
}
