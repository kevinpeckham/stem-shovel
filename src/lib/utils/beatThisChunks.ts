/**
 * The start frames of Beat This's chunks over a piece of `frames` frames,
 * exactly as its `split_piece` computes them: every `chunk − 2·border`
 * frames from `−border` while below `frames − border`, and (`avoid_short_end`)
 * when the piece is longer than `chunk − 2·border` the last start moved to
 * `frames − (chunk − border)`, so the last chunk ends `border` frames past
 * the piece instead of running short. That last start can be negative for a
 * piece just over one chunk (1489 frames gives [−6, −5]).
 */
export function beatThisChunks(frames: number, chunk = 1500, border = 6): number[] {
	const step = chunk - 2 * border;
	const starts: number[] = [];
	for (let s = -border; s < frames - border; s += step) starts.push(s);
	if (frames > step && starts.length > 0) starts[starts.length - 1] = frames - (chunk - border);
	return starts;
}
