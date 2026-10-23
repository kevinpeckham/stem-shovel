import type { StudioClip } from "#lib/val/StudioSchema.js";
import { clipCrossfades } from "./clipCrossfades";
import { clipSegments } from "./clipSegments";
import { fadeCurve } from "./fadeCurve";

/** What a clip's source holds: its channels and rate (an AudioBuffer, or a test's arrays). */
export interface ClipSource {
	channels: Float32Array[];
	sampleRate: number;
}

/**
 * Clips of one track rendered into plain channel data over [from, to)
 * (docs/dawn-daw-plan.md, D4: Consolidate): each clip's source from its
 * offset, its gain, its fades and the crossfades where clips overlap
 * (utils/clipCrossfades.ts), summed. Stereo out (a mono source goes to
 * both sides). Pure; the caller wraps the result in a buffer and a
 * source. Sources at another rate are resampled by nearest sample.
 */
export function mixClipsToChannels(
	clips: StudioClip[],
	sourceOf: (sourceId: string, clip?: StudioClip) => ClipSource | null,
	range: { from: number; to: number; sampleRate: number },
): Float32Array[] {
	const sr = range.sampleRate;
	const length = Math.max(1, Math.round((range.to - range.from) * sr));
	const out = [new Float32Array(length), new Float32Array(length)];
	const fades = clipCrossfades(clips);
	for (const c of clips) {
		if (!c.sourceId || c.muted) continue;
		// The clip itself goes along: a warped clip's source is the rendering of its warp (docs/multitrack-recorder.md "Warping a clip").
		const src = sourceOf(c.sourceId, c);
		if (!src || src.channels.length === 0) continue;
		const f = fades.get(c.id)!;
		const inCurve = fadeCurve(f.inShape, "in", 1, 256);
		const outCurve = fadeCurve(f.outShape, "out", 1, 256);
		const startSample = Math.round((c.start - range.from) * sr);
		const n = Math.round(c.duration * sr);
		// Each pass of the clip (utils/clipSegments.ts) reads its own stretch of the source; the fades span the whole clip.
		const segments = clipSegments(c);
		let seg = 0;
		for (let i = 0; i < n; i++) {
			const at = startSample + i;
			const t = i / sr;
			while (seg < segments.length - 1 && t >= segments[seg + 1]!.start - c.start) seg++;
			if (at < 0 || at >= length) continue;
			let g = c.gain;
			if (f.fadeIn > 0 && t < f.fadeIn)
				g *= inCurve[Math.min(255, Math.floor((t / f.fadeIn) * 255))]!;
			const left = c.duration - t;
			if (f.fadeOut > 0 && left < f.fadeOut)
				g *= outCurve[Math.min(255, Math.floor((1 - left / f.fadeOut) * 255))]!;
			const s = segments[seg]!;
			const srcIndex = Math.round((s.offset + (t - (s.start - c.start))) * src.sampleRate);
			for (let ch = 0; ch < 2; ch++) {
				const data = src.channels[Math.min(ch, src.channels.length - 1)]!;
				const v = srcIndex < data.length ? data[srcIndex]! : 0;
				out[ch]![at] += v * g;
			}
		}
	}
	return out;
}
