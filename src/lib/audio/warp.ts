import { WARP_RATIO_MAX, WARP_RATIO_MIN } from "#lib/constants/studio.js";
import { stretchChannels } from "#lib/utils/stretchChannels.js";
import type { StudioWarp, StudioWarpPoint } from "#lib/val/StudioSchema.js";

/**
 * A clip's warp (docs/multitrack-recorder.md "Warping a clip"): points
 * mapping the clip's content seconds (`at`) to the file's (`source`), the
 * map straight between neighbors and carried on past the first and last
 * points at the segment's own rate. The clip's `offset`, `duration` and
 * `loop` are seconds of the warped content, so a warp stretches the
 * audio under the clip without moving anything the clip says about
 * itself; `renderWarp` makes that content from the file with the WSOLA
 * (utils/stretchChannels.ts), a segment at a time. Pure, like measures.ts.
 */

/** The pair of points a content second falls between (the first or last pair beyond the ends). */
function segmentAt(warp: StudioWarp, at: number): [StudioWarpPoint, StudioWarpPoint] {
	let i = 0;
	while (i < warp.length - 2 && warp[i + 1]!.at <= at) i++;
	return [warp[i]!, warp[i + 1]!];
}
/** File seconds per content second across a segment (0 for a held file position). */
const slopeOf = (a: StudioWarpPoint, b: StudioWarpPoint) =>
	b.at > a.at ? (b.source - a.source) / (b.at - a.at) : 0;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** The file second the clip's content second `at` plays. */
export function warpSourceAt(warp: StudioWarp, at: number): number {
	const [a, b] = segmentAt(warp, at);
	return a.source + (at - a.at) * slopeOf(a, b);
}

/** The content second at which the file's second `source` plays (the segment's start where the file is held). */
export function warpContentAt(warp: StudioWarp, source: number): number {
	let i = 0;
	while (i < warp.length - 2 && warp[i + 1]!.source < source) i++;
	const a = warp[i]!;
	const slope = slopeOf(a, warp[i + 1]!);
	return slope > 0 ? a.at + (source - a.source) / slope : a.at;
}

/** How much longer the content runs than the file at `at`: 2 means twice as long (half speed); Infinity where the file is held. */
export function warpRatioAt(warp: StudioWarp, at: number): number {
	const [a, b] = segmentAt(warp, at);
	const slope = slopeOf(a, b);
	return slope > 0 ? 1 / slope : Number.POSITIVE_INFINITY;
}

/** The one ratio a warp applies throughout, or null when its segments differ (beyond a hundredth of a percent). */
export function warpUniformRatio(warp: StudioWarp): number | null {
	const first = warpRatioAt(warp, warp[0]!.at);
	if (!Number.isFinite(first)) return null;
	for (let i = 1; i < warp.length - 1; i++) {
		const r = warpRatioAt(warp, warp[i]!.at);
		if (!Number.isFinite(r) || Math.abs(r / first - 1) > 1e-4) return null;
	}
	return first;
}

/** A warp of one ratio from the file's start: `ratio` content seconds for each of the file's, laid over its first `over` seconds. */
export function uniformWarp(ratio: number, over = 1): StudioWarp {
	return [
		{ at: 0, source: 0 },
		{ at: round6(over * ratio), source: round6(over) },
	];
}

/** The warp with every content second `factor` times as long: the whole clip stretched (or squeezed) by hand. */
export function scaleWarp(warp: StudioWarp, factor: number): StudioWarp {
	return warp.map((p) => ({ at: round6(p.at * factor), source: p.source }));
}

/**
 * A warp from points read out of a file, in any order: sorted, a later
 * point on the same content second replacing the earlier, a point that
 * would turn the file backwards dropped; null when fewer than two remain
 * or the file would simply play at its own speed from the first point.
 */
export function warpFromPoints(points: { at: number; source: number }[]): StudioWarp | null {
	const sorted = [...points]
		.filter((p) => Number.isFinite(p.at) && Number.isFinite(p.source) && p.source >= 0)
		.sort((a, b) => a.at - b.at);
	const out: StudioWarpPoint[] = [];
	for (const p of sorted) {
		const last = out[out.length - 1];
		if (last && p.at - last.at < 1e-6) out[out.length - 1] = { at: last.at, source: p.source };
		else if (!last || p.source >= last.source)
			out.push({ at: round6(p.at), source: round6(p.source) });
	}
	if (out.length < 2) return null;
	const ratio = warpUniformRatio(out);
	return ratio !== null && Math.abs(ratio - 1) < 1e-3 ? null : out;
}

/** The warp's points as a lane over the content from zero to `end`: a point at each end, the map's own between. */
export function warpPointsOver(warp: StudioWarp, end: number): StudioWarpPoint[] {
	const inside = warp.filter((p) => p.at > 1e-6 && p.at < end - 1e-6);
	return [
		{ at: 0, source: round6(Math.max(0, warpSourceAt(warp, 0))) },
		...inside,
		{ at: round6(end), source: round6(warpSourceAt(warp, end)) },
	];
}

/**
 * A marker added at content second `at`, pinned where the map already
 * puts the file (so nothing moves until it is dragged); null when a point
 * is there already.
 */
export function warpWithPoint(warp: StudioWarp, at: number): StudioWarp | null {
	if (!(at >= 0) || warp.some((p) => Math.abs(p.at - at) < 0.01)) return null;
	return [...warp, { at: round6(at), source: round6(warpSourceAt(warp, at)) }].sort(
		(a, b) => a.at - b.at,
	);
}

/**
 * The point `index` dragged to content second `at`: it stays at least ten
 * milliseconds inside its neighbors and keeps the segment on either side
 * within the hand range of stretch; null when it cannot move at all.
 */
export function warpWithPointMoved(warp: StudioWarp, index: number, at: number): StudioWarp | null {
	const p = warp[index];
	if (!p || !Number.isFinite(at)) return null;
	const prev = warp[index - 1];
	const next = warp[index + 1];
	let lo = prev ? prev.at + 0.01 : 0;
	let hi = next ? next.at - 0.01 : Number.POSITIVE_INFINITY;
	if (prev && p.source > prev.source) {
		lo = Math.max(lo, prev.at + (p.source - prev.source) * WARP_RATIO_MIN);
		hi = Math.min(hi, prev.at + (p.source - prev.source) * WARP_RATIO_MAX);
	}
	if (next && next.source > p.source) {
		lo = Math.max(lo, next.at - (next.source - p.source) * WARP_RATIO_MAX);
		hi = Math.min(hi, next.at - (next.source - p.source) * WARP_RATIO_MIN);
	}
	if (lo > hi) return null;
	const clamped = round6(Math.min(hi, Math.max(lo, at)));
	if (Math.abs(clamped - p.at) < 1e-6) return null;
	return warp.map((q, i) => (i === index ? { at: clamped, source: q.source } : q));
}

/** The point `index` taken out, its neighbors' segments joining; null when fewer than two points would remain. */
export function warpWithoutPoint(warp: StudioWarp, index: number): StudioWarp | null {
	const out = warp.filter((_, i) => i !== index);
	return out.length >= 2 && out.length < warp.length ? out : null;
}

/** A key for a cache of warped renderings: the points, nothing else. */
export function warpKey(warp: StudioWarp): string {
	return warp.map((p) => `${p.at}:${p.source}`).join(",");
}

/**
 * The file's channels as the warped content, from content zero to where
 * the file ends: each segment of the map stretched by its own ratio with
 * the WSOLA and laid down in place, neighbors crossfaded over five
 * milliseconds so a marker never clicks; a held file position is silence.
 */
export function renderWarp(
	channels: Float32Array[],
	sampleRate: number,
	warp: StudioWarp,
): Float32Array[] {
	const n = channels[0]?.length ?? 0;
	if (channels.length === 0 || n === 0) return channels.map((c) => c.slice());
	const contentEnd = warpContentAt(warp, n / sampleRate);
	const length = Math.max(1, Math.round(contentEnd * sampleRate));
	const out = channels.map(() => new Float32Array(length));
	// The segment edges in content time: zero, each point inside, the end.
	const edges = [
		0,
		...warp.map((p) => p.at).filter((t) => t > 1e-6 && t < contentEnd - 1e-6),
		contentEnd,
	];
	for (let k = 0; k < edges.length - 1; k++)
		renderSegment(channels, sampleRate, warp, out, {
			ta: edges[k]!,
			tb: edges[k + 1]!,
			first: k === 0,
			last: k === edges.length - 2,
		});
	return out;
}

/** One segment of a warp into `out`: the file between its ends stretched to its length, with the crossfade tails. */
function renderSegment(
	channels: Float32Array[],
	sampleRate: number,
	warp: StudioWarp,
	out: Float32Array[],
	seg: { ta: number; tb: number; first: boolean; last: boolean },
) {
	const n = channels[0]!.length;
	const length = out[0]!.length;
	const xf = Math.round(sampleRate * 0.005);
	const outStart = Math.round(seg.ta * sampleRate);
	const outEnd = Math.min(length, Math.round(seg.tb * sampleRate));
	if (outEnd <= outStart) return;
	const sa = warpSourceAt(warp, seg.ta);
	const sb = warpSourceAt(warp, seg.tb);
	if (!(sb > sa)) return; // the file held: silence
	const ratio = (seg.tb - seg.ta) / (sb - sa);
	const tail = seg.last ? 0 : xf;
	const need = outEnd - outStart + tail;
	const srcA = Math.max(0, Math.round(sa * sampleRate));
	const srcB = Math.min(n, srcA + Math.ceil(need / ratio) + 1);
	const piece = stretchChannels(
		channels.map((c) => c.subarray(srcA, srcB)),
		ratio,
		sampleRate,
	);
	for (let c = 0; c < out.length; c++) {
		const dst = out[c]!;
		const src = piece[c]!;
		for (let i = 0; i < need && outStart + i < length && i < src.length; i++) {
			// The first five milliseconds fade in over the previous segment's tail, which was laid down fading out.
			const w = !seg.first && i < xf ? i / xf : i >= need - tail ? 1 - (i - (need - tail)) / xf : 1;
			dst[outStart + i] += src[i]! * w;
		}
	}
}
