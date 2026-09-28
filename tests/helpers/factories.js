/* Builders for test data, going through the real services. */
import { signUpUser } from "../../src/lib/server/services/authService.js";
import { createEvent } from "../../src/lib/server/services/eventService.js";


let userCounter = 0;
let eventCounter = 0;


export async function createTestUser(overrides = {}) {

	userCounter += 1;
	const input = {
		displayName: `Test User ${userCounter}`,
		email: `user${userCounter}.${Date.now()}@example.test`,
		password: "correct horse battery",
		...overrides
	};
	const result = await signUpUser(input);
	if (!result.ok) {
		throw new Error(`createTestUser failed: ${JSON.stringify(result.errors)}`);
	}
	return { ...result.value, password: input.password };
}

export async function createTestEvent(userId, overrides = {}) {

	eventCounter += 1;
	const result = await createEvent(userId, { name: `Test Event ${eventCounter}`, code: `test-event-${eventCounter}-${Date.now() % 100000}`, ...overrides });
	if (!result.ok) {
		throw new Error(`createTestEvent failed: ${JSON.stringify(result.errors)}`);
	}
	return result.value;
}
