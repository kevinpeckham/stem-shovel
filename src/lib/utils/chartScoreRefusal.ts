import { exportMusicXml } from "@barmark/musicxml";
import { MUSICXML_MAX_LENGTH } from "#lib/constants/notationFormats.js";

/**
 * Why the Chart tab's Score view cannot engrave the chart, in the words
 * `<barmark-score>` logs (`@barmark/score`'s `engraveChart`): the first
 * error the MusicXML export reports, "Line N: message" (the message alone
 * for one about the whole chart), "The chart has no bars" when it names
 * none, or that the score is too large. Null when the export succeeds, and
 * for a blank chart (there is nothing to draw).
 */
export function chartScoreRefusal(
	text: string,
	maxLength: number = MUSICXML_MAX_LENGTH,
): string | null {
	if (!text.trim()) return null;
	const result = exportMusicXml(text, { maxLength });
	if (result.ok) return null;
	if (result.tooLarge) return "The score is too large to draw";
	const first = result.diagnostics.find((d) => d.severity === "error") ?? result.diagnostics[0];
	if (!first) return "The chart has no bars";
	return first.line > 0 ? `Line ${first.line}: ${first.message}` : first.message;
}
