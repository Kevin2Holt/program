/*
	Random ids for the browser. crypto.randomUUID() exists only in secure
	contexts (HTTPS or localhost), so a page opened over plain HTTP on the LAN
	(e.g. testing from a phone) would throw. crypto.getRandomValues() works in
	every context. Ref: RFC 9562 §5.4 (UUID version 4).
*/


const UUID_BYTE_COUNT = 16;
const VERSION_BYTE_INDEX = 6;
const VARIANT_BYTE_INDEX = 8;
const VERSION_4_BITS = 0x40;
const VERSION_CLEAR_MASK = 0x0f;
const VARIANT_RFC_BITS = 0x80;
const VARIANT_CLEAR_MASK = 0x3f;
const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;
const GROUP_ENDS = [8, 12, 16, 20];


export function createUuid() {

	const bytes = crypto.getRandomValues(new Uint8Array(UUID_BYTE_COUNT));
	bytes[VERSION_BYTE_INDEX] = (bytes[VERSION_BYTE_INDEX] & VERSION_CLEAR_MASK) | VERSION_4_BITS;
	bytes[VARIANT_BYTE_INDEX] = (bytes[VARIANT_BYTE_INDEX] & VARIANT_CLEAR_MASK) | VARIANT_RFC_BITS;
	const hex = Array.from(bytes, (byte) => byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, "0")).join("");
	let uuid = "";
	let start = 0;
	for (const end of [...GROUP_ENDS, hex.length]) {
		uuid += (start ? "-" : "") + hex.slice(start, end);
		start = end;
	}
	return uuid;
}
