import { parseChart } from "barmark";

/**
 * Whether the renderers should letter a chart's sections themselves (boxed
 * A, B, C… on each heading, `rehearsalLetters`): yes for a chart that
 * writes no rehearsal marks of its own, no for one that does (`@A`, `@B`:
 * a score's boxed letters read into the chart, or the band's own), since
 * the automatic letters would then stand beside the written ones and
 * number a section twice (Kevin's "I Just Wanna Be—Yours", 2026-11-10).
 */
export function chartRehearsalLetters(text: string): boolean {
	return !parseChart(text).bars.some((bar) => bar.rehearsal);
}
