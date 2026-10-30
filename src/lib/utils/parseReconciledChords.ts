/** A chord symbol is at most this long (the `ChordSegmentSchema` limit). */
const MAX_SYMBOL = 12;

/**
 * The chord reconciler's answer (stem-bench Study 13): the first `{…}` in
 * the text, whose `chords` must be a string array of exactly `bars`
 * entries, each trimmed and capped at 12 characters. Otherwise null chords
 * and the reason.
 */
export function parseReconciledChords(
	text: string,
	bars: number,
): { chords: string[] | null; error: string | null } {
	const json = text.match(/\{[\s\S]*\}/)?.[0];
	if (!json) return { chords: null, error: "no JSON in the answer" };
	let value: unknown;
	try {
		value = JSON.parse(json);
	} catch {
		return { chords: null, error: "JSON parse failed" };
	}
	const chords = (value as { chords?: unknown } | null)?.chords;
	if (!Array.isArray(chords) || !chords.every((c) => typeof c === "string"))
		return { chords: null, error: "chords is not a string array" };
	if (chords.length !== bars)
		return { chords: null, error: `expected ${bars} bars, got ${chords.length}` };
	return { chords: chords.map((c: string) => c.trim().slice(0, MAX_SYMBOL)), error: null };
}
