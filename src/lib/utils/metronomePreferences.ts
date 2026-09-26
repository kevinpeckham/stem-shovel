import { BPM_MAX, BPM_MIN } from "./tapTempo";

/** The metronome's choices, remembered per browser: tempo and beats to the bar. */
const KEY = "stemshovel.metronome";

export interface MetronomePreferences {
	bpm: number;
	beatsPerBar: number;
}

export const BEATS_PER_BAR = [2, 3, 4, 6] as const;
const DEFAULT_METRONOME_PREFERENCES: MetronomePreferences = { bpm: 120, beatsPerBar: 4 };

export function loadMetronomePreferences(): MetronomePreferences {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return { ...DEFAULT_METRONOME_PREFERENCES };
		const p = JSON.parse(raw) as Partial<Record<string, unknown>>;
		const bpm =
			typeof p.bpm === "number" && p.bpm >= BPM_MIN && p.bpm <= BPM_MAX
				? Math.round(p.bpm)
				: DEFAULT_METRONOME_PREFERENCES.bpm;
		const beatsPerBar = (BEATS_PER_BAR as readonly number[]).includes(p.beatsPerBar as number)
			? (p.beatsPerBar as number)
			: DEFAULT_METRONOME_PREFERENCES.beatsPerBar;
		return { bpm, beatsPerBar };
	} catch {
		return { ...DEFAULT_METRONOME_PREFERENCES };
	}
}

export function saveMetronomePreferences(p: MetronomePreferences): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(p));
	} catch {
		// Private mode or a full store: the choice lasts for this page only.
	}
}
