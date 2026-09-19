import type { RecordingQuality } from "./recordingMimeType";

/**
 * The Idea Recorder's capture preferences, remembered per browser
 * (localStorage): lossless where the browser can or compressed for a
 * metered connection, mono or stereo, which microphone, and whether silence
 * is trimmed off the ends of a saved take. The short-take rule lives beside
 * it in discardShortTakes.ts.
 */
const KEY = "stemshovel.recorder";

export interface RecorderPreferences {
	quality: RecordingQuality;
	stereo: boolean;
	/** A MediaDeviceInfo.deviceId, or null for the default microphone. */
	inputId: string | null;
	/** Ask the jobs function to cut silence off the start and end of each take (off by default). */
	trimSilence: boolean;
}

export const DEFAULT_RECORDER_PREFERENCES: RecorderPreferences = {
	quality: "lossless",
	stereo: false,
	inputId: null,
	trimSilence: false,
};

export function loadRecorderPreferences(): RecorderPreferences {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return { ...DEFAULT_RECORDER_PREFERENCES };
		const p = JSON.parse(raw) as Partial<Record<string, unknown>>;
		return {
			quality: p.quality === "compressed" ? "compressed" : "lossless",
			stereo: p.stereo === true,
			inputId: typeof p.inputId === "string" && p.inputId ? p.inputId : null,
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
