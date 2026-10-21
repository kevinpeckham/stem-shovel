/**
 * The fixture song for the DAW checks (docs/daw-interop-plan.md, tier B):
 * the four static test stems (`bun run stems`) as clips at offsets with
 * fades, a MIDI part, markers, a tempo and a meter change and a key
 * change, with an export engine that renders a track by mixing its clips
 * (no inserts). scripts/interop/bundle.ts exports it; the DAW runners
 * judge what a DAW made of it against `.interop/arrangement.json`.
 */
import { readFileSync } from "node:fs";
import type { ExportEngine } from "#lib/audio/studioExport.js";
import { mixClipsToChannels } from "#lib/utils/mixClipsToChannels.js";
import type { StudioArrangement, StudioClip, StudioTrack } from "#lib/val/StudioSchema.js";

/** A 16- or 24-bit PCM WAV (the test stems, a DAW's render) as channel data. */
export function readWav(path: string): { channels: Float32Array[]; sampleRate: number } {
	const b = readFileSync(path);
	const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
	let at = 12;
	let channels = 1;
	let sampleRate = 44100;
	let bits = 16;
	while (at + 8 <= b.length) {
		const id = b.toString("ascii", at, at + 4);
		const size = v.getUint32(at + 4, true);
		if (id === "fmt ") {
			channels = v.getUint16(at + 10, true);
			sampleRate = v.getUint32(at + 12, true);
			bits = v.getUint16(at + 22, true);
		} else if (id === "data") {
			if (bits !== 16 && bits !== 24) throw new Error(`${path}: ${bits}-bit, expected 16 or 24`);
			return { channels: decodePcm(b, at + 8, size, channels, bits / 8), sampleRate };
		}
		at += 8 + size + (size % 2);
	}
	throw new Error(`${path}: no data chunk`);
}

/** Interleaved 16- or 24-bit PCM from `at` as a Float32Array per channel. */
function decodePcm(b: Buffer, at: number, size: number, channels: number, bytes: number) {
	const n = Math.floor(size / bytes / channels);
	const out = Array.from({ length: channels }, () => new Float32Array(n));
	for (let i = 0; i < n; i++)
		for (let c = 0; c < channels; c++) {
			const o = at + (i * channels + c) * bytes;
			out[c]![i] =
				bytes === 2
					? b.readInt16LE(o) / 32768
					: (((b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16)) << 8) >> 8) / 8388608;
		}
	return out;
}

const bufferOf = (w: { channels: Float32Array[]; sampleRate: number }): AudioBuffer =>
	({
		sampleRate: w.sampleRate,
		length: w.channels[0]!.length,
		duration: w.channels[0]!.length / w.sampleRate,
		numberOfChannels: w.channels.length,
		getChannelData: (c: number) => w.channels[c]!,
	}) as unknown as AudioBuffer;

const track = (id: string, name: string, extra: Partial<StudioTrack> = {}): StudioTrack => ({
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
const clip = (
	id: string,
	trackId: string,
	sourceId: string,
	start: number,
	duration: number,
	extra: Partial<StudioClip> = {},
): StudioClip => ({
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
	...extra,
});

export const sources = {
	kick: readWav("static/stems/kick.wav"),
	hats: readWav("static/stems/hats.wav"),
	bass: readWav("static/stems/bass.wav"),
	keys: readWav("static/stems/keys.wav"),
};
const length = Math.min(...Object.values(sources).map((s) => s.channels[0]!.length / s.sampleRate));

export const arrangement: StudioArrangement = {
	version: 1,
	bpm: 120,
	beatsPerBar: 4,
	gridOn: true,
	countIn: false,
	click: false,
	loop: null,
	master: 1,
	key: "A minor",
	keyChanges: [{ start: 8, key: "C major" }],
	// Four bars of 4/4 at 120 (8 s), then 3/4 at 100.
	tempoChanges: [{ start: 8, bpm: 100 }],
	meterChanges: [{ start: 8, beatsPerBar: 3 }],
	markers: [
		{ id: "m1", t: 0, name: "Intro" },
		{ id: "m2", t: 8, name: "Verse" },
		{ id: "m3", t: 12.5, name: "Bridge" },
	],
	tracks: [
		track("t-kick", "Kick"),
		track("t-hats", "Hats"),
		track("t-bass", "Bass", { gain: 0.8, pan: -0.3 }),
		track("t-keys", "Keys", { pan: 0.4 }),
		track("t-piano", "Piano part", { kind: "midi", input: { source: "piano", channel: "stereo" } }),
	],
	clips: [
		clip("Kick take", "t-kick", "kick", 0, Math.min(length, 16)),
		clip("Hats take", "t-hats", "hats", 2, Math.min(length - 1, 10), { offset: 1 }),
		clip("Bass take", "t-bass", "bass", 1.25, Math.min(length, 12), {
			fadeIn: 0.5,
			fadeOut: 1,
			fadeShape: "power",
		}),
		clip("Keys take", "t-keys", "keys", 2.5, Math.min(length, 9), { gain: 0.7 }),
		{
			id: "Chords",
			trackId: "t-piano",
			notes: [
				{ t: 0, d: 1, p: 57, v: 0.9 },
				{ t: 0, d: 1, p: 60, v: 0.8 },
				{ t: 0, d: 1, p: 64, v: 0.8 },
				{ t: 2, d: 1, p: 55, v: 0.9 },
				{ t: 2, d: 1, p: 59, v: 0.8 },
				{ t: 2, d: 1, p: 62, v: 0.8 },
				{ t: 4, d: 0.5, p: 72, v: 1 },
				{ t: 4.5, d: 0.5, p: 71, v: 0.6 },
			],
			start: 4,
			offset: 0,
			duration: 8,
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: "Chords",
		},
	],
};

export const songEnd = arrangement.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
export const engine: ExportEngine = {
	arrangement,
	bufferOf: (id) => (id in sources ? bufferOf(sources[id as keyof typeof sources]) : null),
	async render(target) {
		const sampleRate = 32000;
		const clips = target?.track
			? arrangement.clips.filter((c) => c.trackId === target.track && c.sourceId)
			: arrangement.clips.filter((c) => c.sourceId);
		const channels = mixClipsToChannels(
			clips,
			(id) => sources[id as keyof typeof sources] ?? null,
			{
				from: 0,
				to: songEnd,
				sampleRate,
			},
		);
		return bufferOf({ channels, sampleRate });
	},
};
