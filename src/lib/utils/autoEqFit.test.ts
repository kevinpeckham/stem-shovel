import { describe, expect, it } from "vite-plus/test";
import { AUTO_EQ_MAX_DB, LIVE_TARGET_DB } from "#lib/constants/autoEq.js";
import { EQ_BANDS } from "#lib/constants/playbackEq.js";
import { DEFAULT_PLAYBACK_EQ } from "#lib/val/PlaybackEqSchema.js";
import { autoEqFit } from "./autoEqFit";

const target = [...LIVE_TARGET_DB];
const withBump = (changes: Record<number, number>) => target.map((x, i) => x + (changes[i] ?? 0));
const gains = (eq: ReturnType<typeof autoEqFit>) => EQ_BANDS.map((b) => eq[b].gain);

describe("autoEqFit", () => {
	it("leaves a recording on the target curve flat, whatever its level", () => {
		expect(autoEqFit(target)).toEqual(DEFAULT_PLAYBACK_EQ);
		expect(autoEqFit(target.map((x) => x - 23))).toEqual(DEFAULT_PLAYBACK_EQ);
	});

	it("cuts a low-mid buildup where it sits and boosts a thin top", () => {
		// +8 dB at 250 and 500 Hz: a boomy room.
		const boomy = autoEqFit(withBump({ 3: 8, 4: 8 }));
		const cut = EQ_BANDS.filter((b) => boomy[b].gain < 0);
		expect(cut.length).toBeGreaterThan(0);
		expect(cut.some((b) => boomy[b].freq >= 200 && boomy[b].freq <= 500)).toBe(true);
		expect(Math.min(...gains(boomy))).toBeLessThanOrEqual(-4);
		// -8 dB at 8 and 16 kHz: a dull recording gets its high shelf up.
		const dull = autoEqFit(withBump({ 8: -8, 9: -8 }));
		expect(dull.high.gain).toBeGreaterThanOrEqual(3);
		expect(dull.high.freq).toBeGreaterThanOrEqual(4000);
	});

	it("tames a harsh presence ridge with a cut between 1 and 6 kHz", () => {
		const harsh = autoEqFit(withBump({ 6: 7, 7: 7 }));
		const cuts = EQ_BANDS.filter((b) => harsh[b].gain < 0 && harsh[b].freq >= 1000);
		expect(cuts.length).toBeGreaterThan(0);
		expect(harsh.highPass).toBe(false);
	});

	it("turns the high-pass on for rumble instead of pulling the low shelf down", () => {
		const rumble = autoEqFit(withBump({ 0: 10 }));
		expect(rumble.highPass).toBe(true);
		expect(rumble.low.gain).toBeGreaterThan(-3);
		expect(autoEqFit(withBump({ 0: 1 })).highPass).toBe(false);
	});

	it("keeps every gain within the auto limit and on the half-dB grid", () => {
		const wild = autoEqFit(withBump({ 1: 20, 2: 20, 5: -25, 8: 30 }));
		for (const g of gains(wild)) {
			expect(Math.abs(g)).toBeLessThanOrEqual(AUTO_EQ_MAX_DB);
			expect(g * 2).toBe(Math.round(g * 2));
		}
	});

	it("gives the flat EQ for a spectrum of the wrong shape", () => {
		expect(autoEqFit([])).toEqual(DEFAULT_PLAYBACK_EQ);
		expect(autoEqFit([...target.slice(0, 9), Number.NaN])).toEqual(DEFAULT_PLAYBACK_EQ);
	});
});
