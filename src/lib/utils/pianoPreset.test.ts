import { describe, expect, test } from "vite-plus/test";
import * as v from "valibot";
import { PianoPresetDataSchema } from "#lib/val/PianoPresetSchema.js";
import { decodePianoPreset } from "./decodePianoPreset";
import { encodePianoPreset } from "./encodePianoPreset";
import { pianoPresetKey } from "./pianoPresetKey";
import { resolvePianoSlots } from "./resolvePianoSlots";

describe("piano presets", () => {
	test("a preset from before an effect existed parses with the effect off", () => {
		const parsed = v.parse(PianoPresetDataSchema, { instrument: "organ", reverb: 0.5 });
		expect(parsed.instrument).toBe("organ");
		expect(parsed.reverb).toBe(0.5);
		expect(parsed.rotary).toEqual({ speed: "off" });
		expect(parsed.phaser.mode).toBe("phaser");
		expect(v.safeParse(PianoPresetDataSchema, { instrument: "kazoo" }).success).toBe(false);
	});
	test("a share link round-trips and refuses what is not one", () => {
		const preset = {
			name: "Warm hall ☕",
			data: v.parse(PianoPresetDataSchema, {
				instrument: "pad",
				reverb: 0.8,
				rotary: { speed: "slow" },
			}),
		};
		expect(decodePianoPreset(encodePianoPreset(preset))).toEqual(preset);
		expect(decodePianoPreset("")).toBeNull();
		expect(decodePianoPreset("not a preset")).toBeNull();
	});
	test("slots resolve account over browser over site, and empty slots stay empty", () => {
		const data = v.parse(PianoPresetDataSchema, {});
		const site = [{ name: "Site 1", data }, null, { name: "Site 3", data }, null, null];
		const browser = { 1: { name: "Mine 1", data }, 2: { name: "Mine 2", data } };
		const signedOut = resolvePianoSlots(site, browser, null);
		expect(signedOut.map((s) => s?.name ?? null)).toEqual([
			"Mine 1",
			"Mine 2",
			"Site 3",
			null,
			null,
		]);
		expect(signedOut[0]?.source).toBe("browser");
		const account = [
			{ id: "a", name: "Band 2", slot: 2, data },
			{ id: "b", name: "Unslotted", slot: null, data },
		];
		const signedIn = resolvePianoSlots(site, browser, account);
		expect(signedIn.map((s) => s?.name ?? null)).toEqual([
			"Site 1",
			"Band 2",
			"Site 3",
			null,
			null,
		]);
		expect(signedIn[1]).toMatchObject({ id: "a", source: "account" });
	});
	test("the key ignores field order and tiny differences", () => {
		const a = v.parse(PianoPresetDataSchema, { reverb: 0.3, instrument: "pad" });
		const b = v.parse(PianoPresetDataSchema, { instrument: "pad", reverb: 0.30001 });
		expect(pianoPresetKey(a)).toBe(pianoPresetKey(b));
		expect(pianoPresetKey(a)).not.toBe(pianoPresetKey({ ...a, reverb: 0.31 }));
	});
});
