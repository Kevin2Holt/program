import { describe, expect, it } from "vitest";
import { validateEmail, validateEventCodeShape, validatePassword, validatePhone } from "../../src/lib/validation.js";


describe("field validation", () => {
	it("accepts reasonable emails and rejects broken ones", () => {
		expect(validateEmail("Kevin@Example.com")).toBe("");
		expect(validateEmail("no-at-sign")).not.toBe("");
		expect(validateEmail("")).not.toBe("");
	});

	it("enforces password length", () => {
		expect(validatePassword("short")).not.toBe("");
		expect(validatePassword("long enough")).toBe("");
	});

	it("checks event code shape: 3–32 lowercase letters, digits, single inner hyphens", () => {
		expect(validateEventCodeShape("elm-ward")).toBe("");
		expect(validateEventCodeShape("ELM-Ward")).toBe("");
		expect(validateEventCodeShape("ab")).not.toBe("");
		expect(validateEventCodeShape("a".repeat(33))).not.toBe("");
		expect(validateEventCodeShape("-elm")).not.toBe("");
		expect(validateEventCodeShape("elm-")).not.toBe("");
		expect(validateEventCodeShape("elm--ward")).not.toBe("");
		expect(validateEventCodeShape("elm_ward")).not.toBe("");
	});

	it("keeps phone validation practical", () => {
		expect(validatePhone("801-555-0123")).toBe("");
		expect(validatePhone("+234 803 555 0111")).toBe("");
		expect(validatePhone("(801) 555.0123")).toBe("");
		expect(validatePhone("555-01")).not.toBe("");
		expect(validatePhone("1".repeat(16))).not.toBe("");
		expect(validatePhone("call me")).not.toBe("");
	});
});
