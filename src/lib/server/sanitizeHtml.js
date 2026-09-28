/*
	Server-side sanitization of text-block HTML: the only HTML that reaches the
	public page. Allowlist per the program spec: p br strong em u s ul ol li a
	span h1–h6; links only http/https/mailto; links get rel="noopener noreferrer".
*/
import sanitize from "sanitize-html";


const ALLOWED_TAGS = ["p", "br", "strong", "em", "u", "s", "ul", "ol", "li", "a", "span", "h1", "h2", "h3", "h4", "h5", "h6"];
const LINK_REL = "noopener noreferrer";

const SANITIZE_OPTIONS = {
	allowedTags: ALLOWED_TAGS,
	allowedAttributes: { a: ["href", "target", "rel"] },
	allowedSchemes: ["http", "https", "mailto"],
	allowedSchemesAppliedToAttributes: ["href"],
	allowProtocolRelative: false,
	transformTags: {
		a: (tagName, attribs) => {
			const attributes = { href: attribs.href || "", rel: LINK_REL };
			if (/^https?:/i.test(attributes.href)) {
				attributes.target = "_blank";
			}
			return { tagName, attribs: attributes };
		}
	},
	// Drop the contents of dangerous elements rather than keeping their text.
	nonTextTags: ["style", "script", "textarea", "option", "noscript", "iframe", "object", "embed"]
};


export function sanitizeRichTextHtml(html) {

	return sanitize(typeof html === "string" ? html : "", SANITIZE_OPTIONS);
}
