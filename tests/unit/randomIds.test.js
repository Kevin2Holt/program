import { describe, expect, it } from "vitest";
import { createUuid } from "$lib/randomIds.js";


const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAMPLE_SIZE = 200;


describe("createUuid", () => {
	it("makes RFC 9562 version-4 UUIDs", () => {
		for (let index = 0; index < SAMPLE_SIZE; index += 1) {
			expect(createUuid()).toMatch(UUID_V4_PATTERN);
		}
	});

	it("doesn't repeat", () => {
		const ids = new Set(Array.from({ length: SAMPLE_SIZE }, createUuid));
		expect(ids.size).toBe(SAMPLE_SIZE);
	});
});
