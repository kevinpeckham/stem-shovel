import type { ChordParts } from "barmark";
import { accidentalGlyphs } from "#lib/utils/accidentalGlyphs.js";

/** A chord as display pieces: root and quality on the baseline, the rest raised, the bass after a slash. */
interface ChordPieces {
	root: string;
	/** m, dim, aug or 5: set on the baseline. */
	quality: string;
	/** Extension, sus and tones: set as a superscript. */
	superscript: string;
	bass: string | null;
}

/**
 * A chord's parts as the engraved chart sets them (@barmark/render's
 * `typesetChord`, which its export map does not expose): ♯ and ♭ glyphs,
 * the extension, sus and added tones split off for the superscript.
 */
export function typesetChord(parts: ChordParts): ChordPieces {
	const tones = parts.tones.length ? `(${parts.tones.join(",")})` : "";
	return {
		root: accidentalGlyphs(parts.root),
		quality: parts.quality,
		superscript: accidentalGlyphs(`${parts.extension ?? ""}${parts.sus ?? ""}${tones}`),
		bass: parts.bass ? accidentalGlyphs(parts.bass) : null,
	};
}
