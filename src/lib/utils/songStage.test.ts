import { describe, expect, it } from "vite-plus/test";
import { songStage } from "./songStage";

describe("songStage", () => {
	it("a stage set in settings wins over what the song holds", () => {
		expect(songStage({ stage: "arranging", isFinished: true, hasMix: true, hasStem: true })).toBe(
			"arranging",
		);
		expect(songStage({ stage: "writing", isFinished: false, hasMix: true, hasStem: true })).toBe(
			"writing",
		);
	});
	it("otherwise: finished when marked, mixing with a mix, arranging with a stem, writing until then", () => {
		expect(songStage({ stage: null, isFinished: true, hasMix: true, hasStem: true })).toBe(
			"finished",
		);
		expect(songStage({ stage: null, isFinished: false, hasMix: true, hasStem: true })).toBe(
			"mixing",
		);
		expect(songStage({ stage: null, isFinished: false, hasMix: false, hasStem: true })).toBe(
			"arranging",
		);
		expect(songStage({ stage: null, isFinished: false, hasMix: false, hasStem: false })).toBe(
			"writing",
		);
	});
});
