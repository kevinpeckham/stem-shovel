const ACCIDENTALS: [RegExp, string][] = [
	[/##/g, "𝄪"],
	[/bb(?=\d|$|\))/g, "𝄫"],
	[/#/g, "♯"],
	[/(?<=[A-G]|^|\(|,)b/g, "♭"],
];

/**
 * A chord's or note's ASCII accidentals as the score's glyphs: `F#` → `F♯`,
 * `b9` → `♭9`, `Bbb` → `B𝄫`. The same rules as @barmark/render's `glyphs`
 * (dist/chord.js), which the package's export map does not expose; the
 * chart PDF (chartToPdf.ts) draws with them.
 */
export function accidentalGlyphs(text: string): string {
	return ACCIDENTALS.reduce((t, [re, g]) => t.replace(re, g), text);
}
