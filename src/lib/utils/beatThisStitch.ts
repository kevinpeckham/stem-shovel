/**
 * One logit row (beat or downbeat) of the whole piece from per-chunk logits,
 * as Beat This's `aggregate_prediction` with `overlap_mode="keep_first"`:
 * each chunk loses `border` frames at both ends, the piece starts filled with
 * −1000, and the chunks are written last to first so an earlier chunk wins
 * where two overlap. Chunk `i`'s frame `border + j` lands on piece frame
 * `starts[i] + border + j`; writes outside `[0, frames)` are dropped (numpy's
 * slice clipping), which is where a short piece's padding goes.
 */
export function beatThisStitch(
	chunks: Float32Array[],
	starts: number[],
	frames: number,
	chunk = 1500,
	border = 6,
): Float32Array {
	const out = new Float32Array(frames).fill(-1000);
	for (let c = chunks.length - 1; c >= 0; c--) {
		const logits = chunks[c];
		const offset = starts[c] + border;
		const from = Math.max(0, -offset);
		const to = Math.min(chunk - 2 * border, frames - offset);
		for (let j = from; j < to; j++) out[offset + j] = logits[border + j];
	}
	return out;
}
