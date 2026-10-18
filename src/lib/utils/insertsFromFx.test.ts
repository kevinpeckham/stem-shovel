import type { StudioTrackFx } from "#lib/val/StudioSchema.js";
import { describe, expect, it } from "vite-plus/test";
import { insertsFromFx, insertsOf } from "./insertsFromFx";

/** Every effect off, as the old track chain's default (`fx` from before D2). */
const defaultTrackFx = (): StudioTrackFx => ({
	compressor: { amount: 0, ratio: 4, attack: 0.01, release: 0.25, makeup: 0 },
	tone: { tilt: 0, air: 0, bottom: 0 },
	reverb: { level: 0, size: 0.5 },
});

describe("insertsFromFx", () => {
	it("is empty without effects, or with every one at its zero", () => {
		expect(insertsFromFx(undefined)).toEqual([]);
		expect(insertsFromFx(defaultTrackFx())).toEqual([]);
	});
	it("keeps the active ones in the chain's order with stable ids", () => {
		const fx = defaultTrackFx();
		fx.reverb.level = 0.4;
		fx.compressor.amount = 0.5;
		const list = insertsFromFx(fx);
		expect(list.map((i) => `${i.id}:${i.kind}`)).toEqual([
			"fx-compressor:compressor",
			"fx-reverb:reverb",
		]);
		expect(list[1]!.settings).toEqual({ level: 0.4, size: 0.5 });
	});
	it("insertsOf prefers a list over the old fx", () => {
		const fx = defaultTrackFx();
		fx.tone.air = 1;
		expect(insertsOf({ fx }).map((i) => i.kind)).toEqual(["tone"]);
		expect(insertsOf({ fx, inserts: [] })).toEqual([]);
	});
});
