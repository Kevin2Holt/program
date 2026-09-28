import { describe, expect, it } from "vitest";
import { formatTime12, formatTimeRange, parseTimeText } from "../../src/lib/times.js";


describe("time helpers", () => {
	it("parses the ways people type times", () => {
		expect(parseTimeText("5:30 pm")).toBe("17:30");
		expect(parseTimeText("5:30pm")).toBe("17:30");
		expect(parseTimeText("5p")).toBe("17:00");
		expect(parseTimeText("12 am")).toBe("00:00");
		expect(parseTimeText("12:15 p.m.")).toBe("12:15");
		expect(parseTimeText("1730")).toBe("17:30");
		expect(parseTimeText("9")).toBe("09:00");
		expect(parseTimeText("17:30")).toBe("17:30");
	});

	it("rejects unreadable times", () => {
		expect(parseTimeText("25:00")).toBe("");
		expect(parseTimeText("13 pm")).toBe("");
		expect(parseTimeText("5:75")).toBe("");
		expect(parseTimeText("noon")).toBe("");
	});

	it("formats 12-hour times and ranges", () => {
		expect(formatTime12("00:05")).toBe("12:05 am");
		expect(formatTime12("12:00:00")).toBe("12:00 pm");
		expect(formatTimeRange("09:30", 90)).toBe("9:30 am – 11:00 am");
	});
});
