import { DEFAULT_DRUM_FX } from "$lib/constants/drumMachine";
import type { DrumProject, DrumProjectV1 } from "$lib/val/DrumPatternSchema";

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
		patterns: [
			{
				meter: "4/4",
				steps: p.steps,
				rows: p.rows.map((r) => ({ ...r, pan: 0, delaySend: 0, reverbSend: 0 })),
			},
		],
	};
}
