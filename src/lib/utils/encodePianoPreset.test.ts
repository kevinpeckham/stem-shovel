import { describe, expect, it } from "vite-plus/test";
import * as v from "valibot";
import { PianoPresetDataSchema } from "#lib/val/PianoPresetSchema.js";
import { decodePianoPreset } from "./decodePianoPreset";
import { encodePianoPreset } from "./encodePianoPreset";

describe("encodePianoPreset", () => {
	it("round-trips a full preset through a base64url string", () => {
		const data = v.parse(PianoPresetDataSchema, {
			instrument: "organ",
			reverb: 0.6,
			delay: { time: 0.5, feedback: 0.6, level: 0.3, analog: true },
			phaser: { mode: "flanger", rate: 2, depth: 0.4, mix: 0.5 },
			rotary: { speed: "fast" },
			compressor: { amount: 0.5, ratio: 8 },
			bounce: { depth: 0.3, division: "bar", centre: true },
			arp: { on: true, rate: "16", pattern: "random", octaves: 2, gate: 0.5, latch: false },
			chords: { mode: "notes", style: "jazz", voicing: "rich", octave: 3, strum: "fast" },
		});
		const preset = { name: "Café Organ", data };
		const encoded = encodePianoPreset(preset);
		expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(decodePianoPreset(encoded)).toEqual(preset);
	});
	it("carries the name and the data as JSON", () => {
		const encoded = encodePianoPreset({
			name: "x",
			data: v.parse(PianoPresetDataSchema, {}),
		});
		const b64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
		const json = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
		expect(Object.keys(json)).toEqual(["name", "data"]);
		expect(json.data.instrument).toBe("grand");
	});
});
