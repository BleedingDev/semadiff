const HASH_OFFSET = 14_695_981_039_346_656_037n;
const HASH_PRIME = 1_099_511_628_211n;
const HASH_MODULUS = 18_446_744_073_709_551_557n;

function escapeRegExp(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeEntityText(text: string) {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/(^|[^:])\/\/.*$/gm, "$1 ")
		.replace(/\s+/g, " ")
		.trim();
}

export function canonicalizeEntityText(text: string, name: string) {
	const normalized = normalizeEntityText(text);
	if (!name) {
		return normalized;
	}
	const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g");
	return normalized.replace(pattern, "__ENTITY__");
}

export function hashString(text: string) {
	let hash = HASH_OFFSET;
	for (let index = 0; index < text.length; index += 1) {
		hash =
			(hash * HASH_PRIME + BigInt(text.charCodeAt(index) + 1)) % HASH_MODULUS;
	}
	return hash.toString(16).padStart(16, "0");
}
