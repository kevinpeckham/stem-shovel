import { exportMusicXml } from "@barmark/musicxml";
import { barmarkChartPlays } from "./barmarkChartPlays.js";

/**
 * A chart as MusicXML 4.0 text (`@barmark/musicxml`), for MuseScore,
 * Dorico, Sibelius or Finale; `title` names a chart with no `# Title` line
 * of its own. Null when the chart is blank, has no bars to play, or reads
 * with an error (the exporter writes no XML then; warnings are fine).
 */
export function chartMusicXml(text: string, title: string): string | null {
	if (!text.trim() || !barmarkChartPlays(text)) return null;
	const result = exportMusicXml(text, { title });
	return result.ok ? result.xml : null;
}
