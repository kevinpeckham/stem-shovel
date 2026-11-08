import { exportMidi } from "@barmark/midi";
import { barmarkChartPlays } from "./barmarkChartPlays.js";

/**
 * A chart as a Standard MIDI File (`@barmark/midi`): its play order as
 * block chords, for a DAW or a notation program; `title` names a chart with
 * no `# Title` line of its own, and `tempo` (barmark's beat a minute, the
 * song's declared tempo) times a chart with no `tempo:` (its own wins).
 * Null when the chart is blank, has no bars to play, or reads with an error
 * (the exporter writes no file then; warnings are fine).
 */
export function chartMidi(text: string, title: string, tempo?: number | null): Uint8Array | null {
	if (!text.trim() || !barmarkChartPlays(text)) return null;
	const result = exportMidi(text, tempo ? { title, tempo } : { title });
	return result.ok ? result.bytes : null;
}
