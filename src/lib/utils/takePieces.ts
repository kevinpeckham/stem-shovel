/**
 * Which stretches of a take become clips (docs/multitrack-recorder.md,
 * "Takes"): the whole take from where recording began; cut to the loop
 * region when Punch is on; or, looping, one piece per full pass of the
 * region (the first pass counts when recording began at or before the
 * region's start), every piece placed at the region's start. A loop take
 * with no full pass lands whole. Times in seconds; `from`/`to` index the
 * take's own audio, `start` is where the piece sits on the timeline.
 */
export interface TakePiece {
	from: number;
	to: number;
	start: number;
}

const EPSILON = 0.005;

export function takePieces(take: {
	/** Where on the timeline recording began. */
	from: number;
	/** How long the take ran. */
	duration: number;
	loop: { on: boolean; start: number; end: number } | null;
	punch: boolean;
}): TakePiece[] {
	const { from, duration, loop, punch } = take;
	if (loop?.on && from < loop.end) {
		const pieces: TakePiece[] = [];
		const length = loop.end - loop.start;
		const firstEnd = loop.end - from;
		if (from <= loop.start + EPSILON && firstEnd <= duration + EPSILON)
			pieces.push({ from: loop.start - from, to: Math.min(firstEnd, duration), start: loop.start });
		for (let b = firstEnd; b + length <= duration + EPSILON; b += length)
			pieces.push({ from: b, to: Math.min(b + length, duration), start: loop.start });
		return pieces.length ? pieces : [{ from: 0, to: duration, start: from }];
	}
	if (punch && loop && from < loop.end) {
		const start = Math.max(from, loop.start);
		const to = Math.min(loop.end, from + duration);
		return to - start < 0.05 ? [] : [{ from: start - from, to: to - from, start }];
	}
	return [{ from: 0, to: duration, start: from }];
}
