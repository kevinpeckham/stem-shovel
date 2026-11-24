import {
	DRUM_LAYER_DEFAULT_STEP_DB,
	DRUM_LAYER_MIN_STEP_DB,
	type DrumKitLayer,
} from "#lib/constants/drumKits.js";

/** What a velocity layer plays: a layer's samples (its own, or a louder one's) cut by some dB. */
export interface LayerSource {
	source: DrumKitLayer;
	attenuationDb: number;
}
export type LayerPlan = Record<DrumKitLayer, LayerSource>;

/**
 * How a voice plays each velocity layer (docs/drum-machine.md, "Multisampled
 * kits"), from the loudness of the loudest sample in each layer that has
 * any (max momentary LUFS; null when not measured). A recorded layer plays
 * itself. An empty layer plays the nearest louder recorded layer's samples,
 * attenuated, never boosted:
 *
 * 1. Between two recorded layers, the gap's loudness difference is split
 *    evenly by layer steps: V5 and V1 12 dB apart are 3 dB a step, so V4,
 *    V3 and V2 are cut 3, 6 and 9 dB from V5's samples. A lower layer louder
 *    than the one above makes no cut.
 * 2. Below the lowest recorded layer, each step is the average step from V5
 *    down to it, the layers filled in by (1) included, and at least
 *    DRUM_LAYER_MIN_STEP_DB.
 *
 * Where there is no difference to measure (a voice with only V5, or a
 * loudness unknown), each step is DRUM_LAYER_DEFAULT_STEP_DB.
 *
 * Null when the voice has no V5 file: such a voice is not playable.
 */
export function velocityLayerPlan(
	loudness: Partial<Record<DrumKitLayer, number | null>>,
): LayerPlan | null {
	if (!(5 in loudness)) return null;
	const recorded = ([5, 4, 3, 2, 1] as const).filter((l) => l in loudness);
	const plan = {} as LayerPlan;
	// Each layer's loudness as it will sound: its own, or its source's less the cut. Null where unknown.
	const sounds = {} as Record<DrumKitLayer, number | null>;
	for (const l of recorded) {
		plan[l] = { source: l, attenuationDb: 0 };
		sounds[l] = finite(loudness[l]);
	}

	// Pass 1: the layers between two recorded ones.
	for (let i = 0; i + 1 < recorded.length; i++) {
		const high = recorded[i]!;
		const low = recorded[i + 1]!;
		const steps = high - low;
		if (steps < 2) continue;
		const top = sounds[high];
		const bottom = sounds[low];
		const step =
			top !== null && bottom !== null
				? Math.max(0, top - bottom) / steps
				: DRUM_LAYER_DEFAULT_STEP_DB;
		for (let l = high - 1; l > low; l--) {
			const layer = l as DrumKitLayer;
			const cut = step * (high - l);
			plan[layer] = { source: high, attenuationDb: cut };
			sounds[layer] = top === null ? null : top - cut;
		}
	}

	// Pass 2: the layers below the lowest recorded one.
	const lowest = recorded[recorded.length - 1]!;
	if (lowest > 1) {
		let step = DRUM_LAYER_DEFAULT_STEP_DB;
		if (lowest < 5) {
			let sum = 0;
			let known = true;
			for (let l = 5; l > lowest; l--) {
				const upper = sounds[l as DrumKitLayer];
				const lower = sounds[(l - 1) as DrumKitLayer];
				if (upper === null || lower === null) known = false;
				else sum += upper - lower;
			}
			if (known) step = Math.max(DRUM_LAYER_MIN_STEP_DB, sum / (5 - lowest));
		}
		for (let l = lowest - 1; l >= 1; l--) {
			plan[l as DrumKitLayer] = { source: lowest, attenuationDb: step * (lowest - l) };
		}
	}
	return plan;
}

function finite(n: number | null | undefined): number | null {
	return typeof n === "number" && Number.isFinite(n) ? n : null;
}
