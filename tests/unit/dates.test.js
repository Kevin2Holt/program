import { describe, expect, it } from "vitest";
import { addDays, addMonths, checkIsoDate, countDaysBetween, findMonthEnd, findMonthStart, findWeekStart, formatDateLong, getWeekday, listDatesInclusive, todayInTimeZone } from "../../src/lib/dates.js";


describe("calendar date helpers", () => {
	it("validates real calendar dates only", () => {
		expect(checkIsoDate("2026-02-28")).toBe(true);
		expect(checkIsoDate("2026-02-29")).toBe(false);
		expect(checkIsoDate("2028-02-29")).toBe(true);
		expect(checkIsoDate("2026-13-01")).toBe(false);
		expect(checkIsoDate("26-01-01")).toBe(false);
		expect(checkIsoDate(null)).toBe(false);
	});

	it("adds days across month and year boundaries", () => {
		expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
		expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
	});

	it("adds months without overflowing short months", () => {
		expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
		expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
		expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
		expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
	});

	it("finds week (Sunday) and month boundaries", () => {
		expect(getWeekday("2026-09-28")).toBe(1);
		expect(findWeekStart("2026-09-28")).toBe("2026-09-27");
		expect(findWeekStart("2026-09-27")).toBe("2026-09-27");
		expect(findMonthStart("2026-09-28")).toBe("2026-09-01");
		expect(findMonthEnd("2026-02-10")).toBe("2026-02-28");
	});

	it("counts and lists dates inclusively", () => {
		expect(countDaysBetween("2026-09-27", "2026-10-24")).toBe(27);
		expect(listDatesInclusive("2026-09-29", "2026-10-01")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
	});

	it("reads today in the event's time zone, not the server's", () => {
		const instant = new Date("2026-09-28T03:30:00Z");
		expect(todayInTimeZone("America/Denver", instant)).toBe("2026-09-27");
		expect(todayInTimeZone("Asia/Manila", instant)).toBe("2026-09-28");
	});

	it("formats without shifting the day", () => {
		expect(formatDateLong("2026-10-01")).toBe("Thursday, October 1");
	});
});
