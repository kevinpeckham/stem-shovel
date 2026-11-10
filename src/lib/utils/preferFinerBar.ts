import type { Detection } from "#lib/audio/analysis.js";
import {
	AUTOMATIC_FINER_BAR_MAX_BPM,
	AUTOMATIC_FINER_BAR_SHARE,
} from "#lib/constants/chartVerdict.js";

/**
 * The detection with the finer bar when its ×2 rung nearly ties the beat
 * (`AUTOMATIC_FINER_BAR_SHARE`) and the result stays playable
 * (`AUTOMATIC_FINER_BAR_MAX_BPM`): the tempo doubled and the ladder
 * re-based on it, so the scan's summary and its alternates agree with
 * what is saved. For the automatic grid only, a song with no settings
 * (stem-bench Studies 36b and 37: a chart on the finer bar merges into the
 * coarser one without losing a chord; the reverse loses them). A compound
 * beat (subdivision 3) is left alone: its bar is two dotted beats, and
 * doubling it is not a fold the ladder offers.
 */
export function preferFinerBar(detection: Detection): Detection {
	const { tempo } = detection;
	const double = tempo.alternates.find((r) => r.factor === 2);
	if (!double || tempo.subdivision === 3 || !tempo.bpm) return detection;
	if (double.strength < AUTOMATIC_FINER_BAR_SHARE) return detection;
	const bpm = tempo.bpm * 2;
	if (bpm > AUTOMATIC_FINER_BAR_MAX_BPM) return detection;
	const alternates = tempo.alternates
		.filter((r) => r.factor !== 2)
		.map((r) => ({
			factor: r.factor / 2,
			bpm: Math.round(tempo.bpm * r.factor * 10) / 10,
			strength: Math.round((r.strength / double.strength) * 100) / 100,
		}));
	// The beat it replaced is now the half-tempo rung, as strong against the new beat as the new beat was against it.
	alternates.push({
		factor: 0.5,
		bpm: Math.round(tempo.bpm * 10) / 10,
		strength: Math.round((1 / double.strength) * 100) / 100,
	});
	alternates.sort((a, b) => b.strength - a.strength);
	return { ...detection, tempo: { ...tempo, bpm, alternates } };
}
