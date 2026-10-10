import { describe, expect, it } from "vite-plus/test";
import { ampPresetKey } from "./ampPresetKey";
import { decodeAmpPreset } from "./decodeAmpPreset";
import { encodeAmpPreset } from "./encodeAmpPreset";
import { resolveAmpSlots } from "./resolveAmpSlots";
import { defaultRig } from "./ampPreferences";

describe("amp presets", () => {
	it("a key ignores the master and the field order, and rounds", () => {
		const a = defaultRig("clean");
		const b = { ...a, head: { ...a.head, master: 0.1, gain: 0.35004 } };
		expect(ampPresetKey(b)).toBe(ampPresetKey(a));
		expect(ampPresetKey({ ...a, model: "tweed" })).not.toBe(ampPresetKey(a));
	});
	it("a link round-trips and a broken one is null", () => {
		const preset = { name: "Spring Clean", data: defaultRig("clean") };
		const decoded = decodeAmpPreset(encodeAmpPreset(preset));
		expect(decoded?.name).toBe("Spring Clean");
		expect(decoded && ampPresetKey(decoded.data)).toBe(ampPresetKey(preset.data));
		expect(decodeAmpPreset("not-a-preset")).toBeNull();
		expect(
			decodeAmpPreset(encodeAmpPreset({ name: "x", data: { model: "banjo" } as never })),
		).toBeNull();
	});
	it("resolves six slots per instrument: the account's own, else the browser's, over the site's", () => {
		const site = [{ name: "Site 1", data: defaultRig("clean") }, null, null, null, null, null];
		const browser = {
			1: { name: "Mine", data: defaultRig("tweed") },
			3: { name: "Three", data: defaultRig("tweed") },
		};
		const account = [
			{ id: "p1", name: "Band", instrument: "guitar" as const, slot: 1, data: defaultRig("clean") },
			{
				id: "p2",
				name: "Bass one",
				instrument: "bass" as const,
				slot: 1,
				data: defaultRig("fridge"),
			},
		];
		const signedOut = resolveAmpSlots("guitar", site, browser, null);
		expect(signedOut.map((s) => s?.name ?? null)).toEqual([
			"Mine",
			null,
			"Three",
			null,
			null,
			null,
		]);
		expect(signedOut[0]?.source).toBe("browser");
		const signedIn = resolveAmpSlots("guitar", site, browser, account);
		expect(signedIn[0]).toMatchObject({ id: "p1", source: "account" });
		expect(signedIn[2]).toBeNull();
		expect(resolveAmpSlots("bass", site, {}, account)[0]).toMatchObject({ id: "p2" });
	});
});
