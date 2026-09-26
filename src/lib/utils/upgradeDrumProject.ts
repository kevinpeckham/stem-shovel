import type { DrumProject, DrumProjectV1 } from "$lib/val/DrumPatternSchema";

/** A version 1 project (one pattern, the tempo inside it) as a version 2 project. */
export function upgradeDrumProject(p: DrumProjectV1): DrumProject {
	return {
		v: 2,
		bpm: p.bpm,
		swing: p.swing,
		humanize: 0,
		kit: p.kit,
		patterns: [{ steps: p.steps, rows: p.rows.map((r) => ({ ...r, pan: 0 })) }],
	};
}
