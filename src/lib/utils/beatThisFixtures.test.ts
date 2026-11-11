import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";
import { beatThisChunkOf } from "./beatThisChunkOf.js";
import { beatThisChunks } from "./beatThisChunks.js";
import { beatThisDownbeats } from "./beatThisDownbeats.js";
import { beatThisGrid } from "./beatThisGrid.js";
import { beatThisLogMel } from "./beatThisLogMel.js";
import { beatThisPeaks } from "./beatThisPeaks.js";

/**
 * The port against the Python package's own numbers (tests/fixtures/beat-this,
 * delivered by stem-bench Study 42; manifest.json says what made each file):
 * 32 s of synthetic 4/4 at 110 bpm through `beat_this` 1.1.0.
 */
const dir = "tests/fixtures/beat-this";
const f32 = (name: string) => {
	const bytes = readFileSync(`${dir}/${name}`);
	return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4).slice();
};
const expected = JSON.parse(readFileSync(`${dir}/expected.json`, "utf8")) as {
	beats: number[];
	downbeats: number[];
	tempo: number;
};
const maxDiff = (a: Float32Array, b: Float32Array) => {
	let worst = 0;
	for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
	return worst;
};

describe("the Beat This port against the package's fixtures", () => {
	const mel = beatThisLogMel(f32("audio.f32"));

	test("the log-mel front end is torchaudio's, to float32 noise", () => {
		const reference = f32("logmel.f32");
		expect([mel.frames, mel.mels]).toEqual([1601, 128]);
		expect(mel.data.length).toBe(reference.length);
		expect(maxDiff(mel.data, reference)).toBeLessThan(2e-3);
	});

	test("the first window is the one the package fed the model", () => {
		const starts = beatThisChunks(mel.frames);
		expect(starts).toEqual([-6, 107]);
		const chunk = beatThisChunkOf(mel.data, mel.frames, mel.mels, starts[0]);
		expect(maxDiff(chunk, f32("chunk0.f32"))).toBeLessThan(2e-3);
	});

	test("the stitched logits give the package's beats, downbeats and tempo", () => {
		const beats = beatThisPeaks(f32("beat-logits.f32"));
		const downbeats = beatThisDownbeats(beats, beatThisPeaks(f32("downbeat-logits.f32")));
		expect(beats.map((t) => Math.round(t * 1000) / 1000)).toEqual(expected.beats);
		expect(downbeats.map((t) => Math.round(t * 1000) / 1000)).toEqual(expected.downbeats);
		const grid = beatThisGrid(beats, downbeats);
		expect(grid).toMatchObject({ tempo: Math.round(expected.tempo), beatsPerBar: 4, meter: "4/4" });
	});
});
