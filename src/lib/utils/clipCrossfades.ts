import type { StudioFadeShape } from "#lib/val/StudioSchema.js";

/** A clip's fades as they play: its own, widened to cover any overlap with a neighbor on its track, and their shapes. */
export interface EffectiveFades {
	fadeIn: number;
	fadeOut: number;
	inShape: StudioFadeShape;
	outShape: StudioFadeShape;
}

/**
 * Where two clips on a track overlap they crossfade (docs/dawn-daw-plan.md,
 * D4): the earlier one fades out over the overlap and the later one fades
 * in over it, equal power, so the join holds its level. A clip's own fade
 * stays when it is longer than the overlap, in its own shape; the overlap
 * decides otherwise. An overlap is never longer than half of either clip.
 * Keyed by clip id; pure, over the clips as stored.
 */
export function clipCrossfades<
	C extends {
		id: string;
		trackId: string;
		start: number;
		duration: number;
		fadeIn: number;
		fadeOut: number;
		fadeShape?: StudioFadeShape;
		muted?: boolean;
	},
>(clips: C[]): Map<string, EffectiveFades> {
	const out = new Map<string, EffectiveFades>();
	for (const c of clips)
		out.set(c.id, {
			fadeIn: c.fadeIn,
			fadeOut: c.fadeOut,
			inShape: c.fadeShape ?? "linear",
			outShape: c.fadeShape ?? "linear",
		});
	// A switched-off clip plays nothing, so it makes no crossfade with its neighbors.
	const byTrack = new Map<string, C[]>();
	for (const c of clips.filter((c) => !c.muted))
		(byTrack.get(c.trackId) ?? byTrack.set(c.trackId, []).get(c.trackId)!).push(c);
	for (const list of byTrack.values()) {
		const sorted = [...list].sort((a, b) => a.start - b.start || a.duration - b.duration);
		for (let i = 0; i < sorted.length; i++) {
			const a = sorted[i]!;
			const aEnd = a.start + a.duration;
			for (let j = i + 1; j < sorted.length; j++) {
				const b = sorted[j]!;
				if (b.start >= aEnd) break;
				const overlap = Math.min(aEnd, b.start + b.duration) - b.start;
				if (overlap <= 0) continue;
				const span = Math.min(overlap, a.duration / 2, b.duration / 2);
				const fa = out.get(a.id)!;
				if (span > fa.fadeOut) {
					fa.fadeOut = span;
					fa.outShape = "power";
				}
				const fb = out.get(b.id)!;
				if (span > fb.fadeIn) {
					fb.fadeIn = span;
					fb.inShape = "power";
				}
			}
		}
	}
	return out;
}
