import { DRUM_VELOCITY_NORMAL } from "$lib/constants/drumMachine";
import type { DrumProject, DrumRow } from "$lib/val/DrumPatternSchema";

/** A row from a list of the steps it plays on. */
function row(voice: DrumRow["voice"], steps: number, on: number[], level = 0.8): DrumRow {
	const cells = Array.from({ length: steps }, (_, i) =>
		on.includes(i) ? DRUM_VELOCITY_NORMAL : 0,
	);
	return { voice, level, pan: 0, mute: false, cells };
}

/**
 * What the page opens with the first time: a plain four-to-the-floor bar
 * at 100 bpm, so the first press of Play makes a sound (the same thinking
 * as the tuner's demo on the front page). Eight rows in the kit's usual
 * order, four of them empty for the person to fill.
 */
export function startingDrumProject(): DrumProject {
	const steps = 16;
	return {
		v: 2,
		bpm: 100,
		swing: 0,
		humanize: 0,
		kit: "acoustic",
		patterns: [
			{
				steps,
				rows: [
					row("kick", steps, [0, 4, 8, 12], 0.9),
					row("snare", steps, [4, 12], 0.8),
					row("hat-closed", steps, [0, 2, 4, 6, 8, 10, 12], 0.6),
					row("hat-open", steps, [14], 0.5),
					row("clap", steps, [], 0.7),
					row("rim", steps, [], 0.7),
					row("tom-low", steps, [], 0.8),
					row("tom-high", steps, [], 0.8),
				],
			},
		],
	};
}
