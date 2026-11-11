import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { beatThisLogits } from "./infer";

const f32 = (name: string) => {
	const bytes = readFileSync(`tests/fixtures/beat-this/${name}`);
	return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4).slice();
};
const maxDiff = (a: Float32Array, b: Float32Array) => {
	let worst = 0;
	for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
	return worst;
};

describe("beatThisLogits", () => {
	test("reproduces the package's stitched logits on the fixture's spectrogram", async () => {
		const dir = await mkdtemp(join(tmpdir(), "beat-this-"));
		try {
			const { beat, downbeat } = await beatThisLogits(f32("logmel.f32"), 1601, dir);
			expect([beat.length, downbeat.length]).toEqual([1601, 1601]);
			expect(maxDiff(beat, f32("beat-logits.f32"))).toBeLessThan(1e-2);
			expect(maxDiff(downbeat, f32("downbeat-logits.f32"))).toBeLessThan(1e-2);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	}, 120_000);
});
