import { DRUM_STEP_CHOICES, type DrumSteps, type DrumVoiceId } from "$lib/constants/drumMachine";
import type { DrumPreset } from "$lib/constants/drumPresets";
import { DEFAULT_HUMANIZE } from "$lib/constants/drumMachine";
import type { DrumPattern, DrumProject } from "$lib/val/DrumPatternSchema";

/** The kit's usual balance per voice, for a preset row that names no level. */
const USUAL_LEVEL: Partial<Record<DrumVoiceId, number>> = {
	kick: 0.9,
	snare: 0.8,
	"hat-closed": 0.6,
	"hat-open": 0.5,
	clap: 0.7,
	rim: 0.7,
	ride: 0.5,
	crash: 0.6,
	cowbell: 0.5,
};
const CELL: Record<string, number> = { ".": 0, o: 1, x: 2, X: 3 };

/**
 * A preset as a project: every row's string of `.`, `o`, `x` and `X`
 * becomes cells; the pattern's steps are the string's length, which must
 * be one of the choices and the same for every row of the pattern.
 * Throws on a malformed preset, which the test turns into a failure.
 */
export function drumPresetProject(preset: DrumPreset): DrumProject {
	const patterns: DrumPattern[] = preset.patterns.map((rows, n) => {
		const steps = rows[0]?.cells.length ?? 0;
		if (!(DRUM_STEP_CHOICES as readonly number[]).includes(steps))
			throw new Error(`${preset.id} pattern ${n + 1}: ${steps} steps`);
		return {
			meter: preset.meter ?? "4/4",
			steps: steps as DrumSteps,
			rows: rows.map((row) => {
				if (row.cells.length !== steps)
					throw new Error(`${preset.id} pattern ${n + 1} ${row.voice}: ${row.cells.length} steps`);
				const cells = row.cells.split("").map((c) => {
					const velocity = CELL[c];
					if (velocity === undefined) throw new Error(`${preset.id} ${row.voice}: "${c}"`);
					return velocity;
				});
				return {
					voice: row.voice,
					level: row.level ?? USUAL_LEVEL[row.voice] ?? 0.8,
					pan: row.pan ?? 0,
					mute: false,
					cells,
				};
			}),
		};
	});
	return {
		v: 2,
		bpm: preset.bpm,
		swing: preset.swing ?? 0,
		swingGrid: preset.swingGrid ?? 16,
		humanize: preset.humanize ?? DEFAULT_HUMANIZE,
		kit: preset.kit ?? "acoustic",
		patterns,
	};
}
