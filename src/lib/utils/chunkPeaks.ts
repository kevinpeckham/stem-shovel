/**
 * The live waveform of a take under way (docs/multitrack-recorder.md):
 * each capture chunk is reduced to one peak (the loudest sample across
 * the channels) per `binFrames`, appended to `peaks`. Frames before
 * `skipFrames` (the lead-in before the take's start) are left out. The
 * accumulator carries a bin that straddles chunks.
 */
export interface ChunkPeaksState {
	peaks: number[];
	/** Frames seen so far, the lead-in included. */
	seen: number;
	/** The bin under way: its loudest sample and how many frames it holds. */
	acc: number;
	accFrames: number;
}

export function chunkPeaksState(): ChunkPeaksState {
	return { peaks: [], seen: 0, acc: 0, accFrames: 0 };
}

export function appendChunkPeaks(
	state: ChunkPeaksState,
	channels: Float32Array[],
	opts: { binFrames: number; skipFrames: number },
): void {
	const n = channels[0]?.length ?? 0;
	for (let i = 0; i < n; i++) {
		if (state.seen + i < opts.skipFrames) continue;
		for (const data of channels) {
			const v = Math.abs(data[i]);
			if (v > state.acc) state.acc = v;
		}
		if (++state.accFrames === opts.binFrames) {
			state.peaks.push(state.acc);
			state.acc = 0;
			state.accFrames = 0;
		}
	}
	state.seen += n;
}
