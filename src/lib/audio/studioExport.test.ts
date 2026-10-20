import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vite-plus/test";
import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import { bundleExport, EXPORT_DEFAULTS, exportSong, fileSafe } from "./studioExport";

// The MP3 encoder runs LAME in a worker the browser spawns; here it answers with a stand-in blob.
const encodeMp3 = vi.hoisted(() =>
	vi.fn(async () => new Blob([new Uint8Array([0xff, 0xfb, 0x90, 0x00])], { type: "audio/mpeg" })),
);
vi.mock("./encodeMp3", () => ({ encodeMp3 }));

/** A buffer the way the Web Audio one reads: a sine at an amplitude, stereo, 48 kHz, a second long. */
function fakeBuffer(amplitude: number, seconds = 1, duty = 1): AudioBuffer {
	const sampleRate = 48000;
	const length = Math.round(seconds * sampleRate);
	const data = new Float32Array(length);
	// `duty` under 1 leaves most of every 400 ms block silent: a peaky signal, quiet on average.
	const block = Math.round(0.4 * sampleRate);
	for (let i = 0; i < length; i++)
		data[i] =
			i % block < duty * block ? amplitude * Math.sin((2 * Math.PI * 1000 * i) / sampleRate) : 0;
	return {
		sampleRate,
		length,
		duration: seconds,
		numberOfChannels: 2,
		getChannelData: () => data,
	} as unknown as AudioBuffer;
}

const arrangement: StudioArrangement = {
	version: 1,
	bpm: 120,
	beatsPerBar: 4,
	gridOn: true,
	countIn: false,
	click: false,
	loop: null,
	master: 1,
	buses: [{ id: "b1", name: "Drums/FX", gain: 1, pan: 0, muted: false }],
	tracks: [
		{
			id: "t1",
			name: "Guitar",
			gain: 1,
			pan: 0,
			muted: false,
			solo: false,
			armed: false,
			input: null,
		},
		{
			id: "t2",
			name: "Empty",
			gain: 1,
			pan: 0,
			muted: false,
			solo: false,
			armed: false,
			input: null,
		},
	],
	clips: [
		{
			id: "c1",
			trackId: "t1",
			sourceId: "s1",
			start: 0,
			offset: 0,
			duration: 1,
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: "Take",
		},
	],
};

function engine(amplitude = 0.1) {
	return {
		arrangement,
		render: vi.fn(async () => fakeBuffer(amplitude)),
		bufferOf: vi.fn((id: string) => (id === "s1" ? fakeBuffer(0.5) : null)),
	};
}
const app = { name: "Stem Shovel Dawn", version: "0.138.0" };

describe("exportSong", () => {
	it("renders the mix as a 24-bit WAV, measured", async () => {
		const e = engine();
		const files = await exportSong(e, "My Song", EXPORT_DEFAULTS, app);
		expect(files.map((f) => f.name)).toEqual(["My Song.wav"]);
		expect(e.render).toHaveBeenCalledWith();
		// 44 bytes of header, then 3 bytes a sample, two channels.
		expect(files[0]!.blob.size).toBe(44 + 48000 * 2 * 3);
		// A −20 dBFS sine on both channels reads −20 LUFS (the channels' mean squares add).
		expect(files[0]!.loudness?.integrated).toBeCloseTo(-20, 0);
		expect(files[0]!.gainDb).toBe(0);
	});
	it("renders a stem per track with clips and per bus, 16-bit, normalized to the target", async () => {
		const e = engine(0.1);
		const steps: string[] = [];
		const files = await exportSong(
			e,
			"My Song",
			{ ...EXPORT_DEFAULTS, mix: false, tracks: true, buses: true, bits: 16, normalize: true },
			app,
			(s) => steps.push(s),
		);
		expect(files.map((f) => f.name)).toEqual(["My Song - Guitar.wav", "My Song - Drums-FX.wav"]);
		expect(e.render).toHaveBeenCalledWith({ track: "t1" });
		expect(e.render).toHaveBeenCalledWith({ bus: "b1" });
		expect(files[0]!.blob.size).toBe(44 + 48000 * 2 * 2);
		// A −20 dBFS stereo sine reads −20 LUFS; the lift to −14 is 6 dB, under the −1 dBTP ceiling (the peak lands at −14).
		expect(files[0]!.loudness?.integrated).toBeCloseTo(-20, 0);
		expect(files[0]!.gainDb).toBeCloseTo(6, 0);
		expect(steps).toEqual(["Rendering Guitar…", "Rendering Drums/FX…"]);
	});
	it("stops a normalization at the true-peak ceiling", async () => {
		// Short bursts of a −6 dBFS sine: about −23 LUFS, so the target wants +9 dB, but the peaks allow only +5 (to −1 dBTP).
		const e = { ...engine(), render: vi.fn(async () => fakeBuffer(0.5, 1, 0.02)) };
		const files = await exportSong(e, "x", { ...EXPORT_DEFAULTS, normalize: true }, app);
		expect(files[0]!.loudness?.truePeak).toBeCloseTo(-6, 0);
		expect(files[0]!.gainDb).toBeCloseTo(5, 0);
	});
	it("renders the mix and the stems as MP3s, measured and normalized the same way", async () => {
		const e = engine(0.1);
		const files = await exportSong(
			e,
			"My Song",
			{ ...EXPORT_DEFAULTS, tracks: true, buses: true, format: "mp3", normalize: true },
			app,
		);
		expect(files.map((f) => f.name)).toEqual([
			"My Song.mp3",
			"My Song - Guitar.mp3",
			"My Song - Drums-FX.mp3",
		]);
		expect(files.map((f) => f.blob.type)).toEqual(["audio/mpeg", "audio/mpeg", "audio/mpeg"]);
		expect(files[0]!.blob.size).toBe(4);
		expect(encodeMp3).toHaveBeenCalledTimes(3);
		// The encoder gets the normalized channels at the buffer's rate.
		const [channels, sampleRate] = encodeMp3.mock.calls[0] as unknown as [Float32Array[], number];
		expect(sampleRate).toBe(48000);
		expect(channels).toHaveLength(2);
		expect(channels[0]!.length).toBe(48000);
		expect(files[0]!.loudness?.integrated).toBeCloseTo(-20, 0);
		expect(files[0]!.gainDb).toBeCloseTo(6, 0);
	});
	it("writes a DAWproject with the project, the metadata and the clips' sources", async () => {
		const files = await exportSong(
			engine(),
			"Exiles",
			{ ...EXPORT_DEFAULTS, mix: false, dawproject: true },
			app,
		);
		expect(files.map((f) => f.name)).toEqual(["Exiles.dawproject"]);
		expect(files[0]!.blob.type).toBe("application/vnd.bitwig.dawproject");
		const entries = unzipSync(new Uint8Array(await files[0]!.blob.arrayBuffer()));
		expect(Object.keys(entries).sort()).toEqual(["audio/s1.wav", "metadata.xml", "project.xml"]);
		expect(strFromU8(entries["project.xml"]!)).toContain('<File path="audio/s1.wav"/>');
		expect(strFromU8(entries["metadata.xml"]!)).toContain("<Title>Exiles</Title>");
		expect(entries["audio/s1.wav"]!.length).toBe(44 + 48000 * 2 * 3);
	});
	it("bundles files into one zip named after the song", async () => {
		const files = await exportSong(engine(), "A/B: C", { ...EXPORT_DEFAULTS, tracks: true }, app);
		const zip = await bundleExport("A/B: C", files);
		expect(zip.name).toBe("A-B- C.zip");
		const entries = unzipSync(new Uint8Array(await zip.blob.arrayBuffer()));
		expect(Object.keys(entries).sort()).toEqual(["A-B- C - Guitar.wav", "A-B- C.wav"]);
	});
	it("fileSafe keeps a name a filesystem takes", () => {
		expect(fileSafe('  a:b*c?"d<e>f|g\\h/i  ')).toBe("a-b-c-d-e-f-g-h-i");
		expect(fileSafe("   ")).toBe("untitled");
	});
});
