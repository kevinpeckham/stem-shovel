import * as v from "valibot";
import { AMP_MODELS } from "#lib/constants/amp.js";
import {
	AmpPreferencesSchema,
	AmpRigSchema,
	type AmpModelId,
	type AmpPreferences,
	type AmpRig,
} from "#lib/val/AmpSchema.js";

/** The Practice Amp's settings, remembered per browser (docs/practice-amp.md). */
const KEY = "stemshovel.amp";

/** A rig at the model's own defaults. */
export function defaultRig(model: AmpModelId): AmpRig {
	return v.parse(AmpRigSchema, { model, head: AMP_MODELS[model].defaults });
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
