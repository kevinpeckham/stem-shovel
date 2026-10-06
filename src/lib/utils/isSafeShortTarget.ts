/**
 * Whether a short link's target is a path on this site and nothing else:
 * one leading slash (so `//host` and a scheme are out), no backslash (a
 * browser reads `/\host` as `//host`), no control characters (a CR or LF
 * would split the Location header). The length limit is the schema's.
 */
export function isSafeShortTarget(target: string): boolean {
	if (typeof target !== "string" || target.length === 0) return false;
	if (target[0] !== "/" || target[1] === "/") return false;
	if (target.includes("\\")) return false;
	for (let i = 0; i < target.length; i++) {
		const c = target.charCodeAt(i);
		if (c < 0x20 || c === 0x7f) return false;
	}
	return true;
}
