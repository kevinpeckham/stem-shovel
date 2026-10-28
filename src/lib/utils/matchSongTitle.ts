/**
 * A title compared loosely: lowercase, accents dropped, quotes and
 * apostrophes removed, other punctuation and symbols read as spaces, spacing
 * collapsed, and a leading "the " ignored.
 */
function normalizeTitle(title: string): string {
	return title
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/['"`´‘’‚‛“”„‟]/gu, "")
		.replace(/[\p{P}\p{S}]/gu, " ")
		.replace(/\s+/gu, " ")
		.trim()
		.replace(/^the /u, "");
}

/** A trailing "(…)" or "[…]" on a line, as in "Interbellum (acoustic)". */
const TRAILING_ASIDE = /\s*(?:\([^()]*\)|\[[^[\]]*\])\s*$/u;
/** A " - …" note after the title, as in "Interbellum – key of D" (a dash with spaces round it). */
const DASH_NOTE = /\s+[-–—]\s+.*$/u;

/**
 * The song a pasted line names (docs/band-plan.md, "Set list"), or null.
 * The line and each title are compared after `normalizeTitle`; one song
 * whose title equals the whole line wins. Failing that, the line without a
 * trailing parenthetical or a " - …" note is tried, and one song whose title
 * equals what is left wins. Two songs that fit equally well, or none, give
 * null; a line is never matched on part of a title ("Love" is not "Love Song").
 */
export function matchSongTitle(
	line: string,
	songs: { id: string; title: string }[],
): string | null {
	const keyed = songs.map((s) => ({ id: s.id, key: normalizeTitle(s.title) }));
	const find = (text: string) => {
		const key = normalizeTitle(text);
		return key === "" ? [] : keyed.filter((s) => s.key === key).map((s) => s.id);
	};
	const exact = new Set(find(line));
	if (exact.size > 0) return exact.size === 1 ? [...exact][0]! : null;

	const withoutAside = line.replace(TRAILING_ASIDE, "");
	const withoutNote = line.replace(DASH_NOTE, "");
	const shorter = new Set(
		[withoutAside, withoutNote, withoutNote.replace(TRAILING_ASIDE, "")]
			.filter((t) => t !== line)
			.flatMap(find),
	);
	return shorter.size === 1 ? [...shorter][0]! : null;
}
