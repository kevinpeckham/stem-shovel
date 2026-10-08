import { DEFAULT_DRUM_FX, DEFAULT_DRUM_SENDS } from "#lib/constants/drumMachine.js";
import type { DrumProject, DrumProjectV1 } from "#lib/val/DrumPatternSchema.js";

/** A version 1 project (one pattern, the tempo inside it) as a version 2 project. */
export function upgradeDrumProject(p: DrumProjectV1): DrumProject {
	return {
		v: 2,
		bpm: p.bpm,
		swing: p.swing,
		swingGrid: 16,
		fx: { ...DEFAULT_DRUM_FX },
		humanize: 0,
		kit: p.kit,
		timeline: [],
		patterns: [
			{
				meter: "4/4",
				steps: p.steps,
				rows: p.rows.map((r) => ({ ...r, pan: 0, ...DEFAULT_DRUM_SENDS[r.voice] })),
			},
		],
	};
}
