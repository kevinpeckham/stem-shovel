/**
 * The tints a stem row can wear (docs/stem-engine.md, "Tints"): a short,
 * restrained palette, every hue at the same middling lightness and low
 * saturation so a tinted row reads as a hint against the navy, never a
 * rainbow (Kevin). Stored by id on the stem, shared with the song; the
 * hex is the one place the colour lives. No tint is the player's blue.
 */
export const STEM_TINTS = [
	{ id: "sea", name: "Sea", hex: "#7FB2C2" },
	{ id: "sage", name: "Sage", hex: "#95B59A" },
	{ id: "olive", name: "Olive", hex: "#B5B47A" },
	{ id: "sand", name: "Sand", hex: "#D2BC8F" },
	{ id: "clay", name: "Clay", hex: "#D39A7E" },
	{ id: "rose", name: "Rose", hex: "#C98A9C" },
	{ id: "lilac", name: "Lilac", hex: "#A99BC9" },
	{ id: "slate", name: "Slate", hex: "#9AA7C0" },
] as const;

export type StemTint = (typeof STEM_TINTS)[number]["id"];

export const STEM_TINT_IDS = STEM_TINTS.map((t) => t.id) as [StemTint, ...StemTint[]];

/** The hex for a tint id, or null for none (and for an id the palette no longer has). */
export function stemTintHex(id: string | null | undefined): string | null {
	return STEM_TINTS.find((t) => t.id === id)?.hex ?? null;
}
