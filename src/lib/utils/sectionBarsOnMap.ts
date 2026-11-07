import { barAt, type TimingMap } from "@barmark/sync";

/**
 * The song's sections as the played bars they start on in a chart's timing
 * map (`{ name, bar }`, the draft card's shape); a section the map does not
 * reach (before its first bar, at or past its end) is left out.
 */
export function sectionBarsOnMap(
	map: TimingMap,
	sections: { name: string; start: number }[],
): { name: string; bar: number }[] {
	return sections.flatMap((s) => {
		const at = barAt(map, s.start);
		return at ? [{ name: s.name, bar: at.bar }] : [];
	});
}
