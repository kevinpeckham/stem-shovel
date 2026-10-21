import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import { describe, expect, it } from "vite-plus/test";
import { convertEngine } from "./convertEngine";

const sr = 1000;
const tone = (n: number, v: number) => new Float32Array(n).fill(v);
const track = (
	id: string,
	name: string,
	extra: Partial<StudioArrangement["tracks"][number]> = {},
) => ({
	id,
	name,
	gain: 1,
	pan: 0,
	muted: false,
	solo: false,
	armed: false,
	input: null,
	...extra,
});
const clip = (id: string, trackId: string, sourceId: string, start: number, duration: number) => ({
	id,
	trackId,
	sourceId,
	start,
	offset: 0,
	duration,
	gain: 1,
	fadeIn: 0,
	fadeOut: 0,
	name: id,
});
const arrangement: StudioArrangement = {
	version: 1,
	bpm: 120,
	beatsPerBar: 4,
	gridOn: true,
	countIn: false,
	click: false,
	loop: null,
	master: 0.5,
	tracks: [
		track("a", "Guitar", { gain: 0.5, pan: -1, output: "bus" }),
		track("b", "Bass"),
		track("m", "Piano", { kind: "midi" }),
	],
	buses: [{ id: "bus", name: "Guitars", gain: 2, pan: 0, muted: false }],
	clips: [
		clip("c1", "a", "mono", 0, 1),
		clip("c2", "b", "stereo", 1, 1),
		{ ...clip("c3", "m", "", 0, 2), sourceId: undefined, notes: [{ t: 0, d: 1, p: 60, v: 1 }] },
	],
};
const sources = new Map([
	["mono", { channels: [tone(sr, 0.4)], sampleRate: sr }],
	["stereo", { channels: [tone(sr, 0.2), tone(sr, 0.6)], sampleRate: sr }],
]);
const at = (b: AudioBuffer, ch: number, s: number) => b.getChannelData(ch)[Math.round(s * sr)]!;

describe("convertEngine", () => {
	const e = convertEngine(arrangement, sources, 1000);
	it("renders a track through its fader and pan: a mono clip hard left keeps the left channel, the right empty", async () => {
		const b = await e.render({ track: "a" });
		expect(b.sampleRate).toBe(sr);
		expect(b.duration).toBe(2);
		expect(at(b, 0, 0.5)).toBeCloseTo(0.2);
		expect(at(b, 1, 0.5)).toBeCloseTo(0);
		expect(at(b, 0, 1.5)).toBe(0);
	});
	it("renders a bus as its tracks through the bus fader, and the mix as direct tracks plus buses through the master", async () => {
		const bus = await e.render({ bus: "bus" });
		expect(at(bus, 0, 0.5)).toBeCloseTo(0.4);
		expect(at(bus, 0, 1.5)).toBe(0);
		const mix = await e.render();
		expect(at(mix, 0, 0.5)).toBeCloseTo(0.2);
		expect(at(mix, 0, 1.5)).toBeCloseTo(0.1);
		expect(at(mix, 1, 1.5)).toBeCloseTo(0.3);
	});
	it("does not render a MIDI track, and honors mute and solo", async () => {
		expect(e.renders?.("m")).toBe(false);
		expect(e.renders?.("a")).toBe(true);
		const silent = await e.render({ track: "m" });
		expect(Math.max(...silent.getChannelData(0))).toBe(0);
		const soloed = convertEngine(
			{
				...arrangement,
				tracks: arrangement.tracks.map((t) => (t.id === "b" ? { ...t, solo: true } : t)),
			},
			sources,
			1000,
		);
		expect(at(await soloed.render({ track: "a" }), 0, 0.5)).toBe(0);
		expect(at(await soloed.render({ track: "b" }), 1, 1.5)).toBeCloseTo(0.6);
	});
	it("hands the sources back as buffers", () => {
		expect(e.bufferOf("stereo")?.numberOfChannels).toBe(2);
		expect(e.bufferOf("gone")).toBeNull();
	});
});
