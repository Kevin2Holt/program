/*
	Password hashing with Node's built-in scrypt.
	Stored format (reference key PWFMT): scrypt$N$r$p$saltHex$keyHex
*/
import crypto from "node:crypto";


const SCRYPT_COST_N = 2 ** 15;
const SCRYPT_BLOCK_SIZE_R = 8;
const SCRYPT_PARALLELISM_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
// scrypt needs 128 * N * r bytes; allow headroom above Node's 32 MB default.
const SCRYPT_MAX_MEMORY_BYTES = 128 * SCRYPT_COST_N * SCRYPT_BLOCK_SIZE_R * 2;
const HASH_PREFIX = "scrypt";
const HASH_PART_COUNT = 6;



function runScrypt(password, salt, keyLength, options) {

	return new Promise((resolve, reject) => {
		crypto.scrypt(password, salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key)));
	});
}

export async function hashPassword(password) {

	const salt = crypto.randomBytes(SALT_BYTES);
	const key = await runScrypt(password, salt, KEY_BYTES, {
		N: SCRYPT_COST_N,
		r: SCRYPT_BLOCK_SIZE_R,
		p: SCRYPT_PARALLELISM_P,
		maxmem: SCRYPT_MAX_MEMORY_BYTES
	});
	return [HASH_PREFIX, SCRYPT_COST_N, SCRYPT_BLOCK_SIZE_R, SCRYPT_PARALLELISM_P, salt.toString("hex"), key.toString("hex")].join("$");
}

export async function verifyPassword(password, storedHash) {

	const parts = typeof storedHash === "string" ? storedHash.split("$") : [];
	if (parts.length !== HASH_PART_COUNT || parts[0] !== HASH_PREFIX) {
		return false;
	}
	const [, costN, blockR, parallelP, saltHex, keyHex] = parts;
	const expected = Buffer.from(keyHex, "hex");
	const actual = await runScrypt(password, Buffer.from(saltHex, "hex"), expected.length, {
		N: Number(costN),
		r: Number(blockR),
		p: Number(parallelP),
		maxmem: SCRYPT_MAX_MEMORY_BYTES
	});
	return crypto.timingSafeEqual(actual, expected);
}
