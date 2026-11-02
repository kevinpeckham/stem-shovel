import { downloadBlob } from "#lib/utils/downloadBlob.js";

/**
 * The progression pad's Download menu (docs/chord-player.md, "The
 * progression pad"): the progression as a Standard MIDI File or as a
 * barmark chord chart (`.chart.md`), each named after the pad, read when
 * the item is chosen so a renamed pad downloads under its new name.
 */
export function progressionDownloads(pad: { name: string; midi(): Blob; chart(): string }) {
	const stem = () => (pad.name || "progression").replace(/[^\w.-]+/g, "-");
	return [
		{
			id: "midi",
			label: "MIDI file",
			iconClass: "i-ph-file-audio",
			action: () => downloadBlob(pad.midi(), `${stem()}.mid`),
		},
		{
			id: "chart",
			label: "Barmark chord chart",
			iconClass: "i-ph-music-notes-simple",
			action: () =>
				downloadBlob(
					new Blob([pad.chart()], { type: "text/markdown;charset=utf-8" }),
					`${stem()}.chart.md`,
				),
		},
	];
}
