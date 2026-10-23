import { STEM_TINTS } from "#lib/constants/stemTints.js";

/**
 * A DAW's track color as Dawn keeps it (docs/multitrack-recorder.md "Track
 * colors"): the tint's id when the color is one of Dawn's own palette
 * exactly (a color Dawn wrote, coming back), else the color itself as a
 * lower-case `#rrggbb`; undefined for no color. Six hex digits, with or
 * without the hash.
 */
export function colourOfHex(hex: string | null | undefined): string | undefined {
	const six = hex?.match(/^#?([0-9a-f]{6})$/i)?.[1];
	if (!six) return undefined;
	const lower = `#${six.toLowerCase()}`;
	return STEM_TINTS.find((t) => t.hex.toLowerCase() === lower)?.id ?? lower;
}
