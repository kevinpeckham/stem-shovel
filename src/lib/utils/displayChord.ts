import { parseChord } from "barmark";
import { tonicPitchClass } from "#lib/utils/tonicPitchClass.js";

const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

/** A note name with ♯ and ♭; in flats, a sharp note respelled as its flat (C# → D♭). */
function note(name: string, flats: boolean): string {
	if (flats && name.includes("#")) {
		const pc = tonicPitchClass(name);
		if (pc !== null) return FLAT_NAMES[pc]!;
	}
	return name.replace(/#/g, "♯").replace(/b/g, "♭");
}

/**
 * A chord symbol as the app shows it (docs/barmark-integration-audit.md):
 * barmark's canonical spelling (`Bm7♭5` → `Bm7(♭5)`, `Cadd9` → `C(9)`)
 * with ♯ and ♭ for the accidentals, a diminished quality as ° and an
 * augmented one as + (`Bdim7` → `B°7`, `Caug` → `C+`). `flats` respells a
 * sharp root or bass as its flat (for a flat key). A symbol barmark cannot
 * read is returned as it came.
 */
export function displayChord(symbol: string, opts: { flats?: boolean } = {}): string {
	const parsed = parseChord(symbol.replace(/♯/g, "#").replace(/♭/g, "b"));
	if (!parsed.ok || parsed.value.root === null) return symbol;
	const { canonical, root, parts } = parsed.value;
	const flats = opts.flats ?? false;
	const bass = parts?.bass ?? null;
	let rest = canonical.slice(root.length, bass ? canonical.length - bass.length - 1 : undefined);
	if (parts?.quality === "dim") rest = rest.replace(/^dim/, "°");
	else if (parts?.quality === "aug") rest = rest.replace(/^aug/, "+");
	rest = rest.replace(/[#b](?=\d)/g, (a) => (a === "#" ? "♯" : "♭"));
	return `${note(root, flats)}${rest}${bass ? `/${note(bass, flats)}` : ""}`;
}
