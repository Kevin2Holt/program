import { describe, expect, it } from "vitest";
import { sanitizeRichTextHtml } from "../../src/lib/server/sanitizeHtml.js";


describe("rich text sanitization", () => {
	it("keeps allowed formatting", () => {
		const html = "<h2>Speakers</h2><p>Hi <strong>there</strong> <em>you</em> <u>all</u> <s>x</s></p><ul><li>one</li></ul><ol><li>two</li></ol>";
		expect(sanitizeRichTextHtml(html)).toBe(html);
	});

	it("removes scripts, handlers, styles, and unknown tags", () => {
		const cleaned = sanitizeRichTextHtml("<p onclick=\"x()\" style=\"color:red\" class=\"c\">ok</p><script>alert(1)</script><img src=x onerror=y><iframe src=\"x\"></iframe>");
		expect(cleaned).toBe("<p>ok</p>");
	});

	it("allows only http, https, and mailto links, and hardens external ones", () => {
		expect(sanitizeRichTextHtml("<a href=\"javascript:alert(1)\">x</a>")).toBe("<a rel=\"noopener noreferrer\">x</a>");
		expect(sanitizeRichTextHtml("<a href=\"data:text/html,x\">x</a>")).toBe("<a rel=\"noopener noreferrer\">x</a>");
		expect(sanitizeRichTextHtml("<a href=\"https://example.com\" rel=\"opener\">x</a>")).toBe("<a href=\"https://example.com\" rel=\"noopener noreferrer\" target=\"_blank\">x</a>");
		expect(sanitizeRichTextHtml("<a href=\"mailto:clerk@example.org\">mail</a>")).toBe("<a href=\"mailto:clerk@example.org\" rel=\"noopener noreferrer\">mail</a>");
	});

	it("handles non-strings", () => {
		expect(sanitizeRichTextHtml(null)).toBe("");
	});
});
