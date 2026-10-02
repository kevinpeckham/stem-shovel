import type { RecordingQuality } from "./recordingMimeType";

/**
 * The Idea Recorder's capture preferences, remembered per browser
 * (localStorage): lossless where the browser can or compressed for a
 * metered connection, and whether silence is trimmed off the ends of a saved
 * take. The short-take rule lives beside it in discardShortTakes.ts; the
 * microphone, line in and computer settings in src/lib/audio/inputs.svelte.ts.
 */
const KEY = "stemshovel.recorder";

export interface RecorderPreferences {
	quality: RecordingQuality;
	/** Ask the jobs function to cut silence off the start and end of each take (off by default). */
	trimSilence: boolean;
}

export const DEFAULT_RECORDER_PREFERENCES: RecorderPreferences = {
	quality: "lossless",
	trimSilence: false,
};

export function loadRecorderPreferences(): RecorderPreferences {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return { ...DEFAULT_RECORDER_PREFERENCES };
		const p = JSON.parse(raw) as Partial<Record<string, unknown>>;
		return {
			quality: p.quality === "compressed" ? "compressed" : "lossless",
			trimSilence: p.trimSilence === true,
		};
	} catch {
		return { ...DEFAULT_RECORDER_PREFERENCES };
	}
}

export function saveRecorderPreferences(p: RecorderPreferences): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(p));
	} catch {
		// Private mode or a full store: the choice lasts for this page only.
	}
}
