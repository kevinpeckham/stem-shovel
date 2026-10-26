import type { PlaybackEqSettings } from "#lib/val/PlaybackEqSchema.js";
import { normalizePlaybackEq } from "./normalizePlaybackEq.js";

/** Where a session's EQ is remembered on the device: one entry per session. */
const PLAYBACK_EQ_KEY_PREFIX = "stem-shovel:session-eq:";
export const playbackEqKey = (sessionId: string) => `${PLAYBACK_EQ_KEY_PREFIX}${sessionId}`;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): Store | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

/**
 * The EQ this device remembers for the session, normalized; null when none
 * is saved, the entry is unreadable or storage is unavailable (the caller
 * falls back to the session's shared EQ, then to flat).
 */
export function loadPlaybackEq(
	sessionId: string,
	storage: Store | null = browserStorage(),
): PlaybackEqSettings | null {
	try {
		const raw = storage?.getItem(playbackEqKey(sessionId));
		if (!raw) return null;
		const v: unknown = JSON.parse(raw);
		return v && typeof v === "object" ? normalizePlaybackEq(v) : null;
	} catch {
		return null;
	}
}

/** Remember the session's EQ on this device; a storage failure is ignored. */
export function savePlaybackEq(
	sessionId: string,
	settings: PlaybackEqSettings,
	storage: Store | null = browserStorage(),
): void {
	try {
		storage?.setItem(playbackEqKey(sessionId), JSON.stringify(settings));
	} catch {
		// Private mode, quota or blocked site data: the EQ lasts for the page only.
	}
}

/** Forget the session's EQ on this device (Reset: back to the shared EQ or flat). */
export function clearPlaybackEq(sessionId: string, storage: Store | null = browserStorage()): void {
	try {
		storage?.removeItem(playbackEqKey(sessionId));
	} catch {
		// As above.
	}
}
