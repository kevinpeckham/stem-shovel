import { clipContentTime } from "./clipSegments";
import type { ClipSpan } from "./trimmedClip";

/** The shortest piece a range edit keeps; anything shorter is dropped. */
const MIN_PIECE_SECONDS = 0.001;
const round4 = (x: number) => Math.round(x * 10000) / 10000;

/**
 * The part of a clip that lies in [from, to) on the timeline
 * (docs/dawn-daw-plan.md, D4, range edits): `start` and `duration` cut to
 * the window, `offset` moved to where the content stands at the new start
 * (through a looped clip's passes, as splitClipAt does). An edge the
 * window cuts has no fade; an edge the clip keeps keeps its fade, shrunk
 * to half the piece. Every other field (notes, lanes, warp, loop,
 * alternates, gain envelope) is copied as it is: they are content
 * seconds, and the offset places them. Null when the piece would be
 * shorter than a millisecond. The id stays; a caller making two pieces
 * gives one a new id.
 */
export function clipPart<C extends ClipSpan & { loop?: { start: number; end: number } }>(
	clip: C,
	from: number,
	to: number,
): C | null {
	const end = clip.start + clip.duration;
	const start = Math.max(clip.start, from);
	const stop = Math.min(end, to);
	if (stop - start < MIN_PIECE_SECONDS) return null;
	const duration = round4(stop - start);
	const cutLeft = start > clip.start;
	const cutRight = stop < end;
	return {
		...clip,
		start: round4(start),
		offset: cutLeft ? round4(clipContentTime(clip, start - clip.start)) : clip.offset,
		duration,
		fadeIn: cutLeft ? 0 : Math.min(clip.fadeIn, duration / 2),
		fadeOut: cutRight ? 0 : Math.min(clip.fadeOut, duration / 2),
	};
}
