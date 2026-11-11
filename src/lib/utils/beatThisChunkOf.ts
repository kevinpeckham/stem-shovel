/**
 * The model input for the chunk starting at frame `start` of a row-major
 * `[frames][mels]` spectrogram, always `chunk × mels` because the ONNX export
 * is static at 1500 frames. `split_piece` takes the rows from `max(start, 0)`
 * to `min(start + chunk, frames)`, pads `max(0, −start)` zero rows on the
 * left and `max(0, min(border, start + chunk − frames))` on the right; when
 * the piece is short that is fewer than `chunk` rows, and the rest here is
 * zeros on the right. The logits for frames past the piece's end are dropped
 * by `beatThisStitch`, which never writes outside `[0, frames)`. `_border`
 * is unused (the right padding to `chunk` covers split_piece's border rows)
 * and kept so the call reads like `split_piece`'s.
 */
export function beatThisChunkOf(
	spect: Float32Array,
	frames: number,
	mels: number,
	start: number,
	chunk = 1500,
	_border = 6,
): Float32Array {
	const out = new Float32Array(chunk * mels);
	const from = Math.max(start, 0);
	const to = Math.min(start + chunk, frames);
	const left = Math.max(0, -start);
	if (to > from) out.set(spect.subarray(from * mels, to * mels), left * mels);
	return out;
}
