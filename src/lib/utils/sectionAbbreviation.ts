/** The usual section names and their timeline abbreviations (keys lowercase, spaces and hyphens removed). */
const KNOWN: Record<string, string> = {
	intro: "In",
	verse: "V",
	prechorus: "PC",
	chorus: "Ch",
	bridge: "Br",
	solo: "So",
	interlude: "Int",
	breakdown: "Bd",
	outro: "Out",
	coda: "Co",
	refrain: "Ref",
	hook: "Hk",
	tag: "Tag",
	vamp: "Vp",
};

/** Articles, conjunctions and "of", left out of initials ("Dicking Around on the Moon" → "DAOM"). */
const MINOR = new Set(["a", "an", "the", "and", "or", "nor", "but", "of"]);

/**
 * A section name shortened for the timeline, where a block is often too
 * narrow for the name: "Verse 2" → "V2", "Pre-chorus" → "PC", "Guitar
 * Solo" → "GS". A leading roman numeral with a separator ("II - Verse")
 * is dropped, a trailing number ("Verse 2", "Verse - 2", "Verse2") is
 * kept; an unknown name of four characters or fewer stays as written,
 * a longer one becomes the initials of its words (up to four, skipping
 * articles, conjunctions and "of" while other words remain).
 */
export function sectionAbbreviation(name: string): string {
	let rest = name.trim().replace(/^[IVXLCDM]+\s*[-–.:]\s*/i, "");
	const numbered = /^(.*?)\s*[-–]?\s*(\d+)$/.exec(rest);
	const number = numbered && numbered[1] ? numbered[2] : "";
	if (number) rest = numbered![1].trim();
	if (!rest) return number;
	const known = KNOWN[rest.toLowerCase().replace(/[\s-]+/g, "")];
	if (known) return known + number;
	if (rest.length <= 4) return rest + number;
	const words = rest.split(/[\s\-–_/]+/).filter(Boolean);
	// One long word: its first three letters ("Turnaround" → "Tur"), not a lone initial.
	if (words.length === 1) return words[0]!.slice(0, 3) + number;
	const major = words.filter((w) => !MINOR.has(w.toLowerCase()));
	const initials = (major.length > 0 ? major : words)
		.map((w) => w[0].toUpperCase())
		.slice(0, 4)
		.join("");
	return initials + number;
}
