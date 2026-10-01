/**
 * JSON with object keys in sorted order at every level, so two objects
 * that hold the same values serialise the same whatever order their keys
 * were set in (a valibot output lists keys in schema order, a snapshot of
 * engine state in the order the engine set them). Arrays keep their order.
 */
export function stableStringify(value: unknown): string {
	return JSON.stringify(sorted(value));
}

function sorted(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sorted);
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			out[key] = sorted((value as Record<string, unknown>)[key]);
		}
		return out;
	}
	return value;
}
