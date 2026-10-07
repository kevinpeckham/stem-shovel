/**
 * A clip after a trim (docs/multitrack-recorder.md, "Editing clips"): a
 * new left edge moves `start` and `offset` together, no earlier than the
 * source's own start; a new right edge sets the duration, no later than
 * the source's end. A clip keeps at least 10 ms, and its fades shrink to
 * fit. Returns null when nothing changes. Values rounded to a tenth of a
 * millisecond, as the arrangement stores them.
 */
export interface ClipSpan {
	start: number;
	offset: number;
	duration: number;
	fadeIn: number;
	fadeOut: number;
}

const MIN_SECONDS = 0.01;
const round4 = (x: number) => Math.round(x * 10000) / 10000;

export function trimmedClip(
	clip: ClipSpan,
	edges: { start?: number; end?: number },
	sourceSeconds: number,
): ClipSpan | null {
	const end0 = clip.start + clip.duration;
	let start = clip.start;
	let offset = clip.offset;
	let end = end0;
	if (edges.start !== undefined) {
		start = Math.max(clip.start - clip.offset, Math.min(end0 - MIN_SECONDS, edges.start));
		offset = clip.offset + (start - clip.start);
	}
	if (edges.end !== undefined)
		end = Math.max(start + MIN_SECONDS, Math.min(start + (sourceSeconds - offset), edges.end));
	if (start === clip.start && offset === clip.offset && end === end0) return null;
	const duration = round4(end - start);
	return {
		start: round4(start),
		offset: round4(Math.max(0, offset)),
		duration,
		fadeIn: Math.min(clip.fadeIn, duration / 2),
		fadeOut: Math.min(clip.fadeOut, duration / 2),
	};
}
