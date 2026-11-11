import { describe, expect, it } from "vite-plus/test";
import type { BeatThisBeats } from "./beatThisBeats";
import { trackerBarGrid } from "./trackerBarGrid";

const BEAT = 0.5;

/**
 * A reading with one bar per entry of `counts` (that many beats a bar, a
 * beat every half second), each downbeat among the beats as Beat This
 * stores them, a last downbeat where the last bar ends, and `tail`
 * seconds of audio after it.
 */
function reading(counts: number[], tail = 0): BeatThisBeats {
	const beats: number[] = [];
	const downbeats: number[] = [];
	let t = 0;
	for (const n of counts) {
		downbeats.push(t);
		for (let k = 0; k < n; k++) beats.push(t + k * BEAT);
		t += n * BEAT;
	}
	downbeats.push(t);
	beats.push(t);
	return { version: "test", duration: t + tail, beats, downbeats };
}

describe("trackerBarGrid", () => {
	it("null without a reading, or with fewer than five downbeats", () => {
		expect(trackerBarGrid(null)).toBeNull();
		expect(trackerBarGrid(reading([4, 4, 4]))).toBeNull();
		expect(trackerBarGrid({ version: "test", duration: 30, beats: [], downbeats: [] })).toBeNull();
	});

	it("steady 4/4: every downbeat a bar line, the usual bar's seconds", () => {
		expect(trackerBarGrid(reading([4, 4, 4, 4]))).toEqual({
			bars: [0, 2, 4, 6, 8],
			meter: "4/4",
			barSeconds: 2,
		});
	});

	it("3/4 and 6/8 by the modal count", () => {
		expect(trackerBarGrid(reading([3, 3, 3, 3]))?.meter).toBe("3/4");
		const six = trackerBarGrid(reading([6, 6, 6, 6]));
		expect(six?.meter).toBe("6/8");
		expect(six?.barSeconds).toBe(3);
	});

	it("joins two adjacent half bars into one bar", () => {
		expect(trackerBarGrid(reading([2, 2, 4, 4, 4, 4]))).toEqual({
			bars: [0, 2, 4, 6, 8, 10],
			meter: "4/4",
			barSeconds: 2,
		});
		// 6/8: two bars of three join into one of six.
		expect(trackerBarGrid(reading([6, 6, 3, 3, 6, 6]))?.bars).toEqual([0, 3, 6, 9, 12, 15]);
	});

	it("leaves a half bar with no partner as read", () => {
		expect(trackerBarGrid(reading([4, 4, 2, 4, 4, 4]))).toEqual({
			bars: [0, 2, 4, 5, 7, 9, 11],
			meter: "4/4",
			barSeconds: 2,
		});
	});

	it("joins only pairs: three half bars in a row leave the third as read", () => {
		expect(trackerBarGrid(reading([2, 2, 2, 4, 4, 4, 4, 4]))?.bars).toEqual([
			0, 2, 3, 5, 7, 9, 11, 13,
		]);
	});

	it("never joins bars when the usual bar has an odd count of beats", () => {
		// 3/4 with two one-beat bars side by side: no half of three to join.
		expect(trackerBarGrid(reading([3, 3, 3, 3, 3, 3, 1, 1]))?.bars).toEqual([
			0, 1.5, 3, 4.5, 6, 7.5, 9, 9.5, 10,
		]);
	});

	it("closes with a bar to the audio's end when at least half a bar remains", () => {
		expect(trackerBarGrid(reading([4, 4, 4, 4], 1))?.bars).toEqual([0, 2, 4, 6, 8, 9]);
		expect(trackerBarGrid(reading([4, 4, 4, 4], 1.5))?.bars).toEqual([0, 2, 4, 6, 8, 9.5]);
		// Under half a bar is the last bar's tail, not a bar.
		expect(trackerBarGrid(reading([4, 4, 4, 4], 0.99))?.bars).toEqual([0, 2, 4, 6, 8]);
	});

	it("barSeconds is the median bar of the joined grid", () => {
		// Joined: 2, 2, 2, 2, 2, 1 (an unpaired half), 2.5 (a five-beat bar) → median 2.
		expect(trackerBarGrid(reading([4, 2, 2, 4, 4, 4, 2, 5]))?.barSeconds).toBe(2);
	});

	it("null when fewer than 60% of the bars hold the usual count", () => {
		// 3/4 by the mode, but bars of 2 to 6 beats in no pattern: 3 of 9 steady.
		expect(trackerBarGrid(reading([3, 3, 3, 2, 4, 5, 2, 4, 5]))).toBeNull();
		// Just under: 5 of 9.
		expect(trackerBarGrid(reading([3, 3, 3, 3, 3, 4, 2, 5, 6]))).toBeNull();
	});

	it("a grid when the steady share reaches 60%", () => {
		// Exactly 6 of 10, and 7 of 11.
		expect(trackerBarGrid(reading([3, 3, 3, 3, 3, 3, 4, 2, 5, 6]))?.meter).toBe("3/4");
		const over = trackerBarGrid(reading([3, 3, 3, 3, 3, 3, 3, 4, 2, 5, 6]));
		expect(over?.meter).toBe("3/4");
		expect(over?.bars).toHaveLength(12);
	});

	it("the steady share counts the bars after half bars are joined", () => {
		// As read, 5 of 9 bars hold four beats (under 60%); joined, all 7 do.
		expect(trackerBarGrid(reading([2, 2, 4, 4, 4, 4, 4, 2, 2]))?.bars).toEqual([
			0, 2, 4, 6, 8, 10, 12, 14,
		]);
	});
});
