import { describe, expect, it } from "vite-plus/test";
// The voice's state, apart from its AudioWorkletProcessor shell (static/worklets/stream-voice.js).
import { LEAD_S, Voice, WINDOW_S } from "../../../static/worklets/stream-voice.js";

const RATE = 1000; // LEAD 1500 frames, WINDOW 250
type Msg = { type: string; frame?: number; upto?: number };
const block = (channels = 1) => Array.from({ length: channels }, () => new Float32Array(128));
/** A window whose sample k is `from + k + 1`, so every frame names itself. */
const ramp = (from: number, len: number, channels = 1) =>
	Array.from({ length: channels }, () =>
		Float32Array.from({ length: len }, (_, k) => from + k + 1),
	);
const voice = () => {
	const sent: Msg[] = [];
	return { v: new Voice(RATE, 1, (m: Msg) => sent.push(m)), sent };
};

describe("Voice", () => {
	it("is silent before its start frame and plays from it exactly, mid-block", () => {
		const { v, sent } = voice();
		v.schedule(200, 1000);
		v.feed(0, ramp(0, 2000));
		const a = block();
		expect(v.render(a, 128, 128)).toBe(true);
		expect(a[0].subarray(0, 72).every((x) => x === 0)).toBe(true);
		expect(a[0][72]).toBe(1); // voice frame 0 at context frame 200
		expect(a[0][127]).toBe(56);
		const b = block();
		v.render(b, 256, 128);
		expect(b[0][0]).toBe(57);
		expect(sent).toEqual([]);
	});
	it("ends after its frames, mid-block, posting ended once and returning false", () => {
		const { v, sent } = voice();
		v.schedule(0, 200);
		v.feed(0, ramp(0, 200));
		v.render(block(), 0, 128);
		const b = block();
		expect(v.render(b, 128, 128)).toBe(false);
		expect(b[0][71]).toBe(200);
		expect(b[0][72]).toBe(0);
		expect(v.render(block(), 256, 128)).toBe(false);
		expect(sent.filter((m) => m.type === "ended")).toHaveLength(1);
	});
	it("outputs zeros over a gap and reports it once", () => {
		const { v, sent } = voice();
		v.schedule(0, 5000);
		v.feed(0, ramp(0, 100));
		v.feed(300, ramp(300, 2000));
		const a = block();
		const b = block();
		const c = block();
		v.render(a, 0, 128);
		v.render(b, 128, 128);
		v.render(c, 256, 128);
		expect(a[0][99]).toBe(100);
		expect(a[0][100]).toBe(0);
		expect(b[0].every((x) => x === 0)).toBe(true);
		expect(c[0][43]).toBe(0);
		expect(c[0][44]).toBe(301);
		expect(sent.filter((m) => m.type === "starved")).toEqual([{ type: "starved", frame: 100 }]);
	});
	it("asks for audio through cursor + LEAD + one window, once until fed", () => {
		expect([LEAD_S, WINDOW_S]).toEqual([1.5, 0.25]);
		const { v, sent } = voice();
		v.schedule(0, 10_000);
		v.feed(0, ramp(0, 1750));
		v.render(block(), 0, 128); // held 1622: enough
		expect(sent).toEqual([]);
		v.render(block(), 128, 128); // held 1494 < 1500
		expect(sent).toEqual([{ type: "need", upto: 256 + 1750 }]);
		v.render(block(), 256, 128);
		expect(sent).toHaveLength(1);
		v.feed(1750, ramp(1750, 100));
		v.render(block(), 384, 128); // held 1338 still short: asks again
		expect(sent.at(-1)).toEqual({ type: "need", upto: 512 + 1750 });
		expect(sent).toHaveLength(2);
	});
	it("never asks past its end", () => {
		const { v, sent } = voice();
		v.schedule(0, 1000);
		v.feed(0, ramp(0, 300));
		v.render(block(), 0, 128);
		expect(sent).toEqual([{ type: "need", upto: 1000 }]);
		const { v: w, sent: none } = voice();
		w.schedule(0, 1000);
		w.feed(0, ramp(0, 1000));
		w.render(block(), 0, 128);
		expect(none).toEqual([]);
	});
	it("keeps windows that arrive out of order sorted and drops those behind the cursor", () => {
		const { v } = voice();
		v.schedule(0, 2000);
		v.feed(128, ramp(128, 128));
		v.feed(0, ramp(0, 128));
		const a = block();
		const b = block();
		v.render(a, 0, 128);
		v.render(b, 128, 128);
		expect(a[0][127]).toBe(128);
		expect(b[0][0]).toBe(129);
		expect(v.windows).toHaveLength(0);
		v.feed(0, ramp(0, 100)); // wholly behind
		expect(v.windows).toHaveLength(0);
	});
	it("copies a mono window into every output channel", () => {
		const v = new Voice(RATE, 2, () => {});
		v.schedule(0, 500);
		v.feed(0, ramp(0, 500));
		const a = block(2);
		v.render(a, 0, 128);
		expect(a[1][5]).toBe(6);
	});
	it("starts a voice scheduled in the past at once, from its first frame", () => {
		const { v } = voice();
		v.schedule(10, 500);
		v.feed(0, ramp(0, 500));
		const a = block();
		v.render(a, 128, 128);
		expect(a[0][0]).toBe(1);
	});
	it("ends at the next block after a stop", () => {
		const { v, sent } = voice();
		v.schedule(0, 5000);
		v.feed(0, ramp(0, 2000));
		v.render(block(), 0, 128);
		v.stop();
		const b = block();
		expect(v.render(b, 128, 128)).toBe(false);
		expect(b[0].every((x) => x === 0)).toBe(true);
		expect(sent).toEqual([{ type: "ended" }]);
	});
});
