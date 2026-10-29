import { describe, expect, test } from "vite-plus/test";
import type { Detection } from "#lib/audio/analysis.js";
import { tempoAlternatesText, tempoRungText } from "./tempoRungText.js";

describe("tempoRungText", () => {
	test("each rung in words, rounded", () => {
		expect(tempoRungText(112, 2)).toBe("224 counted in eighths");
		expect(tempoRungText(120, 0.5)).toBe("60 counted in half notes");
		expect(tempoRungText(80, 1.5)).toBe("120 counted in quarters");
		expect(tempoRungText(120, 2 / 3)).toBe("80 counted in dotted quarters");
		expect(tempoRungText(100, 3)).toBe("300 at 3×");
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
				tempo(
					[
						{ factor: 0.5, bpm: 60, strength: 0.7 },
						{ factor: 2, bpm: 240, strength: 0.9 },
						{ factor: 1.5, bpm: 180, strength: 0.6 },
					],
					3,
				),
			),
		).toBe("or 240 counted in eighths, or 60 counted in half notes");
		expect(tempoAlternatesText(tempo([{ factor: 2, bpm: 240, strength: 0.9 }]), 0.5, 1)).toBe(
			"or 240 counted in eighths",
		);
	});
	test("nothing over the floor, no rungs, or 3:2 rungs on a straight beat: empty", () => {
		expect(tempoAlternatesText(tempo([{ factor: 2, bpm: 240, strength: 0.3 }]))).toBe("");
		expect(tempoAlternatesText(tempo([]))).toBe("");
		expect(tempoAlternatesText(tempo([{ factor: 2 / 3, bpm: 80, strength: 1.1 }]))).toBe("");
		expect(tempoAlternatesText(tempo([{ factor: 2 / 3, bpm: 80, strength: 1.1 }], 3))).toBe(
			"or 80 counted in dotted quarters",
		);
	});
});
