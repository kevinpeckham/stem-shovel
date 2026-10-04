import { BPM_MAX, BPM_MIN } from "./tapTempo";

/** The metronome's choices, remembered per browser: tempo, beats to the bar and the session swing (docs/audio-engine.md, "One tempo for the page"). */
const KEY = "stemshovel.metronome";

export interface MetronomePreferences {
	bpm: number;
	beatsPerBar: number;
	/** 0 straight to 1 a triplet feel; the drums and the chord player follow it. */
	swing: number;
}

export const BEATS_PER_BAR = [2, 3, 4, 6] as const;
const DEFAULT_METRONOME_PREFERENCES: MetronomePreferences = { bpm: 120, beatsPerBar: 4, swing: 0 };

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
		const swing =
			typeof p.swing === "number" && Number.isFinite(p.swing)
				? Math.min(1, Math.max(0, Math.round(p.swing * 100) / 100))
				: 0;
		return { bpm, beatsPerBar, swing };
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
