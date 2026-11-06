import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import fixture from "#lib/utils/chordminiCqt.fixture.json";
import { chordminiIndices } from "#lib/utils/chordminiSmooth.js";
import { chordminiLogits } from "./infer";

describe("chordminiLogits", () => {
	test("reproduces the Python reference's logits and chords on the fixture's features", async () => {
		const dir = await mkdtemp(join(tmpdir(), "chordmini-"));
		try {
			const features = Float32Array.from(fixture.features.flat());
			const logits = await chordminiLogits(features, fixture.frames, dir);
			expect(logits.length).toBe(fixture.frames * 170);
			const indices = chordminiIndices(logits, fixture.frames);
			expect(Array.from(indices)).toEqual(fixture.indices);
			const { frame, values } = fixture.logitsSample;
			const row = logits.subarray(frame * 170, (frame + 1) * 170);
			const maxDiff = Math.max(...values.map((v, c) => Math.abs(row[c] - v)));
			expect(maxDiff).toBeLessThan(0.01);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	}, 60_000);
});
