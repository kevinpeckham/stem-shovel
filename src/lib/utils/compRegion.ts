import type { StudioClip } from "#lib/val/StudioSchema.js";

/**
 * Comping (docs/dawn-daw-plan.md, D4): a region of a clip taken from one
 * of its takes. The clip splits at the region's edges into up to three:
 * the outer pieces keep the chosen take, the middle plays `takeSourceId`
 * with the other takes behind it; the pieces overlap by `crossfade` so
 * the engine crossfades them (utils/clipCrossfades.ts). The takes share
 * the clip's origin (they were recorded over the same spot), so the
 * middle piece keeps the clip's offset arithmetic. Null when the take is
 * not one of the clip's, or the region misses the clip. The caller gives
 * the new pieces their ids.
 */
export function compRegion(
	clip: StudioClip,
	takeSourceId: string,
	from: number,
	to: number,
	crossfade = 0.02,
): Omit<StudioClip, "id">[] | null {
	if (!clip.sourceId) return null;
	const ring = [clip.sourceId, ...(clip.alternates ?? [])];
	if (!ring.includes(takeSourceId)) return null;
	const end = clip.start + clip.duration;
	const a = Math.max(clip.start, Math.min(from, to));
	const b = Math.min(end, Math.max(from, to));
	if (b - a < 0.02) return null;
	const round4 = (x: number) => Math.round(x * 10000) / 10000;
	const { id: _id, ...base } = clip;
	const piece = (
		start: number,
		stop: number,
		sourceId: string,
		name: string,
	): Omit<StudioClip, "id"> => ({
		...base,
		sourceId,
		alternates: ring.filter((s) => s !== sourceId),
		start: round4(start),
		offset: round4(clip.offset + (start - clip.start)),
		duration: round4(stop - start),
		name,
		fadeIn: 0,
		fadeOut: 0,
	});
	const out: Omit<StudioClip, "id">[] = [];
	const x = Math.min(crossfade, (b - a) / 2);
	if (a > clip.start + 0.01)
		out.push({
			...piece(clip.start, Math.min(end, a + x), clip.sourceId, clip.name),
			fadeIn: clip.fadeIn,
		});
	out.push(piece(Math.max(clip.start, a - x), Math.min(end, b + x), takeSourceId, clip.name));
	if (b < end - 0.01)
		out.push({
			...piece(Math.max(clip.start, b - x), end, clip.sourceId, clip.name),
			fadeOut: clip.fadeOut,
		});
	// An edge piece shorter than the crossfade would be meaningless; the middle grows into it instead.
	if (out[0]!.start === clip.start && out[0]!.duration < 0.02 && out.length > 1) out.shift();
	return out;
}
