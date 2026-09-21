import { DEFAULT_TUNING_ID } from "$lib/constants/tunings";

/** The tuner's choices, remembered per browser: which tuning, and the reference pitch of A4. */
const KEY = "stemshovel.tuner";

export interface TunerPreferences {
	tuningId: string;
	a4: number;
}

export const DEFAULT_TUNER_PREFERENCES: TunerPreferences = { tuningId: DEFAULT_TUNING_ID, a4: 440 };

export function loadTunerPreferences(): TunerPreferences {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return { ...DEFAULT_TUNER_PREFERENCES };
		const p = JSON.parse(raw) as Partial<Record<string, unknown>>;
		const a4 = typeof p.a4 === "number" && p.a4 >= 400 && p.a4 <= 480 ? p.a4 : 440;
		return { tuningId: typeof p.tuningId === "string" ? p.tuningId : DEFAULT_TUNING_ID, a4 };
	} catch {
		return { ...DEFAULT_TUNER_PREFERENCES };
	}
}

export function saveTunerPreferences(p: TunerPreferences): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(p));
	} catch {
		// Private mode or a full store: the choice lasts for this page only.
	}
}
