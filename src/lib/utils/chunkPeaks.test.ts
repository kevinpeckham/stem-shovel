import { describe, expect, it } from "vite-plus/test";
import { appendChunkPeaks, chunkPeaksState } from "./chunkPeaks";

describe("appendChunkPeaks", () => {
	it("keeps the loudest sample across the channels per bin", () => {
		const state = chunkPeaksState();
		const left = new Float32Array([0.1, -0.9, 0.2, 0.3]);
		const right = new Float32Array([0.5, 0.1, -0.4, 0.0]);
		appendChunkPeaks(state, [left, right], { binFrames: 2, skipFrames: 0 });
		// Float32 samples: compared to a few decimals.
		expect(state.peaks.map((p) => +p.toFixed(4))).toEqual([0.9, 0.4]);
		expect(state.seen).toBe(4);
	});
	it("skips the lead-in and carries a bin across chunks", () => {
		const state = chunkPeaksState();
		appendChunkPeaks(state, [new Float32Array([1, 1, 0.2])], { binFrames: 2, skipFrames: 2 });
		// Frames 0 and 1 are the lead-in; frame 2 opens a bin that is still under way.
		expect(state.peaks).toEqual([]);
		expect(state.accFrames).toBe(1);
		appendChunkPeaks(state, [new Float32Array([0.6, 0.1])], { binFrames: 2, skipFrames: 2 });
		expect(state.peaks.map((p) => +p.toFixed(4))).toEqual([0.6]);
		expect(state.accFrames).toBe(1);
		expect(state.acc).toBeCloseTo(0.1);
	});
	it("does nothing with an empty chunk", () => {
		const state = chunkPeaksState();
		appendChunkPeaks(state, [], { binFrames: 4, skipFrames: 0 });
		expect(state).toEqual(chunkPeaksState());
	});
});
