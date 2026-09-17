/**
 * A listener's own mix of a song, kept in this browser only: fader gains,
 * mutes, solos and the master. It never touches the song's default mix,
 * which members change with an explicit "Save as default mix". Absent when
 * the listener has not moved anything (or has reset), so its presence means
 * "your mix differs from the default".
 */
export interface LocalMix {
	gains: Record<string, number>;
	muted: string[];
	soloed: string[];
	master: number;
}

/** The slice of the engine the mix helpers read (StemEngine, or a test double). */
export interface MixEngine {
	stems: { id: string; gain: number; muted: boolean; soloed: boolean }[];
	master: number;
}
/** …and the slice they drive. */
export interface MixControls extends MixEngine {
	setGain(id: string, value: number): void;
	toggleMute(id: string): void;
	toggleSolo(id: string): void;
	setMaster(value: number): void;
}

const key = (songId: string) => `stem-shovel:mix:${songId}`;

export function loadLocalMix(songId: string): LocalMix | null {
	try {
		const raw = localStorage.getItem(key(songId));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<LocalMix>;
		return {
			gains: typeof parsed.gains === "object" && parsed.gains ? parsed.gains : {},
			muted: Array.isArray(parsed.muted) ? parsed.muted : [],
			soloed: Array.isArray(parsed.soloed) ? parsed.soloed : [],
			master: typeof parsed.master === "number" ? parsed.master : 1,
		};
	} catch {
		return null;
	}
}

export function saveLocalMix(songId: string, mix: LocalMix | null): void {
	try {
		if (mix) localStorage.setItem(key(songId), JSON.stringify(mix));
		else localStorage.removeItem(key(songId));
	} catch {
		// Private windows and blocked storage: the mix simply does not persist.
	}
}

/** What the engine holds now, or null when it matches the song's default mix exactly. */
export function snapshotLocalMix(
	engine: MixEngine,
	defaults: Map<string, number>,
): LocalMix | null {
	const mix: LocalMix = { gains: {}, muted: [], soloed: [], master: engine.master };
	let differs = engine.master !== 1;
	for (const s of engine.stems) {
		const base = defaults.get(s.id) ?? 1;
		if (Math.abs(s.gain - base) > 1e-6) {
			mix.gains[s.id] = s.gain;
			differs = true;
		}
		if (s.muted) {
			mix.muted.push(s.id);
			differs = true;
		}
		if (s.soloed) {
			mix.soloed.push(s.id);
			differs = true;
		}
	}
	return differs ? mix : null;
}

/** Puts a local mix (or, with null, the default mix) onto the engine. */
export function applyLocalMix(
	engine: MixControls,
	mix: LocalMix | null,
	defaults: Map<string, number>,
): void {
	for (const s of engine.stems) {
		engine.setGain(s.id, mix?.gains[s.id] ?? defaults.get(s.id) ?? 1);
		const wantMuted = !!mix?.muted.includes(s.id);
		if (s.muted !== wantMuted) engine.toggleMute(s.id);
		const wantSoloed = !!mix?.soloed.includes(s.id);
		if (s.soloed !== wantSoloed) engine.toggleSolo(s.id);
	}
	engine.setMaster(mix?.master ?? 1);
}
