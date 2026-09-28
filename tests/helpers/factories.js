/* Builders for test data, going through the real services. */
import { signUpUser } from "../../src/lib/server/services/authService.js";


let userCounter = 0;


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
