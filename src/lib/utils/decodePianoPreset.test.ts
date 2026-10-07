import { describe, expect, it } from "vite-plus/test";
import { decodePianoPreset } from "./decodePianoPreset";

/** `{"name":"Warm Hall","data":{"instrument":"epiano","reverb":0.6,"delay":{"level":0.2},"rotary":{"speed":"slow"}}}`, as a link made on 2026-10-07. */
const link =
	"eyJuYW1lIjoiV2FybSBIYWxsIiwiZGF0YSI6eyJpbnN0cnVtZW50IjoiZXBpYW5vIiwicmV2ZXJiIjowLjYsImRlbGF5Ijp7ImxldmVsIjowLjJ9LCJyb3RhcnkiOnsic3BlZWQiOiJzbG93In19fQ";

describe("decodePianoPreset", () => {
	it("opens an old link, filling in every effect it does not mention", () => {
		const preset = decodePianoPreset(link);
		expect(preset?.name).toBe("Warm Hall");
		expect(preset?.data).toEqual({
			instrument: "epiano",
			reverb: 0.6,
			reverbSize: 0.35,
			delay: { time: 0.35, feedback: 0.35, level: 0.2, analog: false },
			chorus: { rate: 0.8, depth: 0.5, mix: 0 },
			phaser: { mode: "phaser", rate: 0.5, depth: 0.7, mix: 0 },
			tremolo: { rate: 5, depth: 0, shape: "sine" },
			fuzz: { drive: 0, tone: 0.5 },
			wah: { mode: "touch", sensitivity: 0.5, rate: 1, range: 0.7, resonance: 0.5, mix: 0 },
			tone: { tilt: 0, air: 0, bottom: 0 },
			rotary: { speed: "slow" },
			compressor: { amount: 0, ratio: 4, attack: 0.01, release: 0.2, makeup: 0 },
			bounce: { depth: 0, division: "beat", glide: 0.5, centre: false },
		});
	});
	it("returns null for anything that is not a preset", () => {
		expect(decodePianoPreset("")).toBeNull();
		expect(decodePianoPreset("not a link")).toBeNull();
		expect(decodePianoPreset(btoa("[]"))).toBeNull();
		expect(decodePianoPreset(btoa('{"name":"x"}'))).toBeNull();
		expect(decodePianoPreset(btoa('{"name":"","data":{}}'))).toBeNull();
		expect(decodePianoPreset(btoa('{"name":"x","data":{"reverb":2}}'))).toBeNull();
	});
});
