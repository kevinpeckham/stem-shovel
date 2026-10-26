import {
	DEFAULT_PLAYBACK_EQ,
	PLAYBACK_EQ_MAX_DB,
	PLAYBACK_EQ_MIN_DB,
	type PlaybackEqSettings,
} from "#lib/audio/playbackEq.js";

/** Where the session player's EQ is remembered, per device. */
export const PLAYBACK_EQ_KEY = "stem-shovel:session-eq";

type Store = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): Store | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

/** A stored gain as a number in range on the 0.5 dB grid, 0 when it is not one. */
function gain(v: unknown): number {
	if (typeof v !== "number" || !Number.isFinite(v)) return 0;
	const clamped = Math.min(PLAYBACK_EQ_MAX_DB, Math.max(PLAYBACK_EQ_MIN_DB, v));
	return Math.round(clamped * 2) / 2 || 0;
}

/** The remembered EQ, or flat when there is none, it is unreadable or storage is unavailable. */
export function loadPlaybackEq(storage: Store | null = browserStorage()): PlaybackEqSettings {
	try {
		const raw = storage?.getItem(PLAYBACK_EQ_KEY);
		if (!raw) return { ...DEFAULT_PLAYBACK_EQ };
		const v = JSON.parse(raw) as Record<string, unknown> | null;
		if (!v || typeof v !== "object") return { ...DEFAULT_PLAYBACK_EQ };
		return {
			highPass: v.highPass === true,
			low: gain(v.low),
			mid: gain(v.mid),
			high: gain(v.high),
		};
	} catch {
		return { ...DEFAULT_PLAYBACK_EQ };
	}
}

/** Remember the EQ on this device; a storage failure is ignored. */
export function savePlaybackEq(
	settings: PlaybackEqSettings,
	storage: Store | null = browserStorage(),
): void {
	try {
		storage?.setItem(PLAYBACK_EQ_KEY, JSON.stringify(settings));
	} catch {
		// Private mode, quota or blocked site data: the EQ lasts for the page only.
	}
}
