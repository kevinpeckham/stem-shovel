import * as v from "valibot";
import { AMP_MODELS, AMP_VOICING } from "#lib/constants/amp.js";
import {
	AmpPreferencesSchema,
	AmpRigSchema,
	type AmpModelId,
	type AmpPreferences,
	type AmpRig,
} from "#lib/val/AmpSchema.js";

/** The Practice Amp's settings, remembered per browser (docs/practice-amp.md). */
const KEY = "stemshovel.amp";

/** A rig at the model's own defaults, the compressor as the instrument's voicing starts it. */
export function defaultRig(model: AmpModelId): AmpRig {
	const m = AMP_MODELS[model];
	return v.parse(AmpRigSchema, {
		model,
		head: m.defaults,
		pedals: { compressor: AMP_VOICING[m.instrument].compressor },
	});
}

export function parseAmpPreferences(raw: unknown): AmpPreferences {
	const r = v.safeParse(AmpPreferencesSchema, raw ?? {});
	return r.success ? r.output : v.parse(AmpPreferencesSchema, {});
}

export function loadAmpPreferences(): AmpPreferences {
	try {
		const raw = localStorage.getItem(KEY);
		return parseAmpPreferences(raw ? JSON.parse(raw) : {});
	} catch {
		return parseAmpPreferences({});
	}
}

export function saveAmpPreferences(p: AmpPreferences): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(p));
	} catch {
		// Private mode: the settings last for this page.
	}
}
