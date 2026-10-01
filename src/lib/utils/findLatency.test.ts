import { describe, expect, it } from "vite-plus/test";
import { findLatency } from "./findLatency";

function recording(sampleRate: number, clicks: number[], delayMs: number, noise = 0.002) {
	const x = new Float32Array(sampleRate * 3);
	for (let i = 0; i < x.length; i++) x[i] = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * noise;
	for (const t of clicks) {
		const at = Math.round((t + delayMs / 1000) * sampleRate);
		for (let k = 0; k < 20; k++) x[at + k] = 0.8 * Math.exp(-k / 6);
	}
	return x;
}

describe("findLatency", () => {
	it("finds the delay of played clicks in a recording", () => {
		const clicks = [0.5, 1.2, 1.9];
		const x = recording(48000, clicks, 37);
		expect(findLatency(x, 48000, clicks)).toBeCloseTo(37, 0);
	});
	it("answers null when the clicks were not heard", () => {
		const x = recording(48000, [], 0);
		expect(findLatency(x, 48000, [0.5, 1.2, 1.9])).toBeNull();
	});
});
