import { describe, expect, test } from "vite-plus/test";
import type { Detection } from "#lib/audio/analysis.js";
import { tempoAlternatesText, tempoRungText } from "./tempoRungText.js";

describe("tempoRungText", () => {
	test("each rung in words, rounded", () => {
		expect(tempoRungText(112, 2)).toBe("224 counted in eighths");
		expect(tempoRungText(120, 0.5)).toBe("60 counted in half notes");
		expect(tempoRungText(80, 1.5)).toBe("120 counted in quarters");
		expect(tempoRungText(120, 2 / 3)).toBe("80 counted in dotted quarters");
		expect(tempoRungText(74.7, 3)).toBe("224 counted three to the bar");
		expect(tempoRungText(100, 4)).toBe("400 at 4×");
	});
});

describe("tempoAlternatesText", () => {
	const tempo = (
		alternates: Detection["tempo"]["alternates"],
		subdivision: 2 | 3 = 2,
	): Detection["tempo"] => ({ bpm: 120, confidence: 0.5, subdivision, alternates });
	test("the strongest rungs over the floor, strongest first, at most two", () => {
		expect(
			tempoAlternatesText(
				tempo([
					{ factor: 0.5, bpm: 60, strength: 0.7 },
					{ factor: 2, bpm: 240, strength: 0.9 },
					{ factor: 1.5, bpm: 180, strength: 0.6 },
				]),
			),
		).toBe("or 240 counted in eighths, or 60 counted in half notes");
		expect(tempoAlternatesText(tempo([{ factor: 2, bpm: 240, strength: 0.9 }]), 0.5, 1)).toBe(
			"or 240 counted in eighths",
		);
	});
	test("a quarter beat never shows the 3:2 rungs or ×3", () => {
		expect(
			tempoAlternatesText(
				tempo([
					{ factor: 3, bpm: 360, strength: 1.2 },
					{ factor: 2 / 3, bpm: 80, strength: 1.1 },
					{ factor: 1.5, bpm: 180, strength: 1 },
					{ factor: 0.5, bpm: 60, strength: 0.6 },
				]),
			),
		).toBe("or 60 counted in half notes");
	});
	test("a dotted-quarter beat shows its eighths three to the bar and its quarters, never ×2", () => {
		const dotted: Detection["tempo"] = {
			bpm: 74.7,
			confidence: 0.5,
			subdivision: 3,
			alternates: [
				{ factor: 2, bpm: 149.4, strength: 0.95 },
				{ factor: 3, bpm: 224.1, strength: 0.9 },
				{ factor: 1.5, bpm: 112.1, strength: 0.7 },
				{ factor: 2 / 3, bpm: 49.8, strength: 0.8 },
				{ factor: 0.5, bpm: 37.4, strength: 0.6 },
			],
		};
		expect(tempoAlternatesText(dotted)).toBe(
			"or 224 counted three to the bar, or 112 counted in quarters",
		);
	});
	test("nothing over the floor or no rungs: empty", () => {
		expect(tempoAlternatesText(tempo([{ factor: 2, bpm: 240, strength: 0.3 }]))).toBe("");
		expect(tempoAlternatesText(tempo([]))).toBe("");
		expect(tempoAlternatesText(tempo([{ factor: 2 / 3, bpm: 80, strength: 1.1 }], 3))).toBe("");
	});
});
