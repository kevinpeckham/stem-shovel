import { layerMix } from "#lib/utils/pianoLayers.js";
import { frequencyOfMidi } from "./pitch";

/**
 * The Grand Piano's samples (docs/piano.md, "Sample tiers"): thirty pitches
 * of the Salamander Grand Piano, Alexander Holm's CC BY 3.0 recordings of
 * a Yamaha C5, one every three semitones from A0 to C8, in three tiers
 * made by scripts/piano-samples.ts:
 *
 *   demo      one layer (v10) as mp3 in static/kits/piano, 3.4 MB: what the
 *             home page's demo plays, and the piano page's first sound;
 *   standard  four layers and the 88 release samples as mp3 from the Blob
 *             store, 15 MB, loaded in the background on the piano page;
 *   hires     six layers and the releases as 16-bit FLAC, 72 MB, on the
 *             Hi-res button, kept in the browser's cache for next time.
 *
 * A note plays the nearest pitch at the playbackRate that tunes it, from
 * the loaded layers on either side of its velocity, crossfaded
 * (pianoLayers). Letting go damps the string and, once the release
 * samples are in, plays the key's release.
 */
export const PIANO_SAMPLE_NOTES = Array.from({ length: 30 }, (_, i) => 21 + 3 * i);
const NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
export const pianoNoteName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
export type PianoTier = "demo" | "standard" | "hires";
export const PIANO_TIERS: Record<PianoTier, { layers: number[]; releases: boolean }> = {
	demo: { layers: [10], releases: false },
	standard: { layers: [4, 8, 12, 16], releases: true },
	hires: { layers: [2, 5, 8, 11, 14, 16], releases: true },
};
/** Bytes per tier, for the button and the screen (what the encode script printed); hi-res as FLAC, or as mp3 where the browser has no FLAC. */
export const PIANO_TIER_BYTES = {
	demo: 3.4e6,
	standard: 14.5e6,
	hires: 71.6e6,
	hiresMp3: 55.2e6,
} as const;

/**
 * Whether this browser decodes FLAC (Chrome, Firefox and Safari since iOS 11
 * do; the probe settles it): a twentieth of a second of silence from
 * static/kits/piano/probe.flac through decodeAudioData, once, no gesture
 * needed. Where it fails the hi-res tier comes as the best mp3 instead
 * (piano/v1/hires-mp3, the same six layers at VBR q0), a little smaller.
 */
let flacSupport: Promise<boolean> | null = null;
export function flacSupported(): Promise<boolean> {
	if (flacSupport) return flacSupport;
	flacSupport = (async () => {
		try {
			const res = await fetch("/kits/piano/probe.flac");
			if (!res.ok) return false;
			const ctx = new OfflineAudioContext(1, 1, 44100);
			await ctx.decodeAudioData(await res.arrayBuffer());
			return true;
		} catch {
			return false;
		}
	})();
	return flacSupport;
}
const CACHE = "piano-samples-v1";

/** Decoded samples: layer → pitch → buffer; and the release samples by key (1 = A0 … 88 = C8). */
const layers = new Map<number, Map<number, AudioBuffer>>();
const releases = new Map<number, AudioBuffer>();
/** Which tier each layer came from, so hires replaces standard's v8 and v16 rather than the other way round. */
const layerTier = new Map<number, PianoTier>();
const TIER_RANK: Record<PianoTier, number> = { demo: 0, standard: 1, hires: 2 };
let demoFiles: Map<number, Promise<ArrayBuffer>> | null = null;
const loading = new Map<PianoTier, Promise<void>>();

export const pianoLayersLoaded = () => [...layers.keys()].sort((a, b) => a - b);
export const pianoDemoReady = () => (layers.get(10)?.size ?? 0) === PIANO_SAMPLE_NOTES.length;
export const pianoTierReady = (tier: PianoTier) =>
	PIANO_TIERS[tier].layers.every(
		(l) => layerTier.get(l) === tier || TIER_RANK[layerTier.get(l) ?? "demo"] > TIER_RANK[tier],
	) &&
	(!PIANO_TIERS[tier].releases || releases.size === 88);

/** Fetch the demo tier ahead of the first note (no context needed yet). */
export function warmPianoSamples(): void {
	if (demoFiles || typeof fetch === "undefined") return;
	demoFiles = new Map(
		PIANO_SAMPLE_NOTES.map((midi) => [
			midi,
			fetch(`/kits/piano/${pianoNoteName(midi)}.mp3`).then((r) => {
				if (!r.ok) throw new Error(`${r.status} for ${pianoNoteName(midi)}.mp3`);
				return r.arrayBuffer();
			}),
		]),
	);
}

/** Decode the demo tier once there is a context. */
export function loadPianoSamples(ctx: BaseAudioContext): Promise<void> {
	warmPianoSamples();
	const had = loading.get("demo");
	if (had) return had;
	const p = Promise.all(
		[...demoFiles!].map(async ([midi, file]) => {
			if (layers.get(10)?.has(midi)) return;
			const buffer = await ctx.decodeAudioData((await file).slice(0));
			place(10, midi, buffer, "demo");
		}),
	)
		.then(() => undefined)
		.catch((e: unknown) => {
			loading.delete("demo");
			demoFiles = null;
			throw e;
		});
	loading.set("demo", p);
	return p;
}

function place(layer: number, midi: number, buffer: AudioBuffer, tier: PianoTier) {
	const from = layerTier.get(layer);
	if (from && TIER_RANK[from] > TIER_RANK[tier]) return; // a better one is already in
	let m = layers.get(layer);
	if (!m || from !== tier) {
		m = new Map();
		layers.set(layer, m);
		layerTier.set(layer, tier);
	}
	m.set(midi, buffer);
}

/** The files a tier is made of, under `base` (…/piano/v1): the standard tier's mp3s, the hi-res tier's FLACs, or its mp3s where FLAC is not decoded. */
export function pianoTierFiles(tier: "standard" | "hires", flac = true): string[] {
	const spec = PIANO_TIERS[tier];
	const dir = tier === "hires" && !flac ? "hires-mp3" : tier;
	const ext = tier === "hires" && flac ? "flac" : "mp3";
	const files: string[] = [];
	// Middle octaves first: they are played most, so the piano improves where it is heard first.
	const notes = [...PIANO_SAMPLE_NOTES].sort((a, b) => Math.abs(a - 60) - Math.abs(b - 60));
	for (const midi of notes)
		for (const v of spec.layers) files.push(`${dir}/${pianoNoteName(midi)}-v${v}.${ext}`);
	if (spec.releases) for (let i = 1; i <= 88; i++) files.push(`${dir}/rel-${i}.${ext}`);
	return files;
}

/**
 * A tier from the Blob store: fetched through the browser's Cache API
 * (so the second visit needs no download), decoded, and placed layer by
 * layer as it arrives; `onprogress` counts files. Six at a time.
 */
export function loadPianoTier(
	ctx: BaseAudioContext,
	tier: "standard" | "hires",
	base: string,
	onprogress?: (done: number, total: number) => void,
): Promise<void> {
	const had = loading.get(tier);
	if (had) return had;
	let done = 0;
	let files: string[] = [];
	const queue: string[] = [];
	// Hi-res as FLAC where the browser decodes it, as mp3 where not: the probe says which, once.
	const p = (tier === "hires" ? flacSupported() : Promise.resolve(true))
		.then((flac) => {
			files = pianoTierFiles(tier, flac);
			queue.push(...files);
			return Promise.all(
				Array.from({ length: 6 }, async () => {
					for (let f = queue.shift(); f; f = queue.shift()) {
						const bytes = await fetchCached(`${base}/${f}`);
						const buffer = await ctx.decodeAudioData(bytes);
						const m = f.match(/\/([A-G]s?\d)-v(\d+)\.|\/rel-(\d+)\./);
						if (m?.[3]) releases.set(Number(m[3]), buffer);
						else if (m?.[1] && m[2]) place(Number(m[2]), noteMidi(m[1]), buffer, tier);
						onprogress?.(++done, files.length);
					}
				}),
			);
		})
		.then(() => undefined)
		.catch((e: unknown) => {
			loading.delete(tier);
			throw e;
		});
	loading.set(tier, p);
	return p;
}

function noteMidi(name: string): number {
	const octave = Number(name.slice(-1));
	return NAMES.indexOf(name.slice(0, -1)) + 12 * (octave + 1);
}

async function fetchCached(url: string): Promise<ArrayBuffer> {
	let cache: Cache | null = null;
	try {
		cache = typeof caches !== "undefined" ? await caches.open(CACHE) : null;
		const hit = await cache?.match(url);
		if (hit) return hit.arrayBuffer();
	} catch {
		cache = null;
	}
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${res.status} for ${url}`);
	if (cache) void cache.put(url, res.clone()).catch(() => {});
	return res.arrayBuffer();
}

/** Whether the hires tier is already in the browser's cache (a past opt-in): then loading it costs no download. */
export async function pianoHiresCached(base: string): Promise<boolean> {
	try {
		if (typeof caches === "undefined") return false;
		const cache = await caches.open(CACHE);
		const probe = await cache.match(`${base}/${pianoTierFiles("hires", await flacSupported())[0]}`);
		return !!probe;
	} catch {
		return false;
	}
}

/** The sample nearest a note, and the rate that pitches it there. */
export function nearestPianoSample(midi: number): { sample: number; rate: number } {
	let sample = PIANO_SAMPLE_NOTES[0]!;
	for (const n of PIANO_SAMPLE_NOTES) if (Math.abs(n - midi) < Math.abs(sample - midi)) sample = n;
	return { sample, rate: frequencyOfMidi(midi) / frequencyOfMidi(sample) };
}

export interface SampledVoice {
	release(when: number): void;
}

/**
 * One note of the Grand Piano into `out`: the nearest pitch from the layers
 * on either side of the velocity, crossfaded, each through a low-pass that
 * only closes for a light touch (the recordings carry the tone; the filter
 * is for a single-layer tier, where soft is the filter's doing). Letting
 * go damps the string over a tenth of a second and plays the key's release
 * sample where there is one.
 */
export function startSampledVoice(
	ctx: BaseAudioContext,
	out: AudioNode,
	midi: number,
	velocity: number,
	when: number,
): SampledVoice | null {
	const { sample, rate } = nearestPianoSample(midi);
	const v = Math.min(1, Math.max(0, velocity));
	const mix = layerMix(
		v,
		pianoLayersLoaded().filter((l) => layers.get(l)?.has(sample)),
	);
	if (mix.length === 0) return null;
	const single = mix.length === 1 && pianoLayersLoaded().length === 1;
	const gain = ctx.createGain();
	// With real layers the recordings carry most of the dynamics; alone, the gain does.
	gain.gain.setValueAtTime(single ? 0.15 + 0.85 * v * v : 0.5 + 0.5 * v, when);
	gain.connect(out);
	const filter = ctx.createBiquadFilter();
	filter.type = "lowpass";
	filter.frequency.value = single ? 5000 + 15000 * v : 9000 + 11000 * v;
	filter.connect(gain);
	const sources: AudioBufferSourceNode[] = [];
	for (const { layer, gain: g } of mix) {
		const buffer = layers.get(layer)?.get(sample);
		if (!buffer) continue;
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.playbackRate.value = rate;
		const lg = ctx.createGain();
		lg.gain.value = g;
		source.connect(lg);
		lg.connect(filter);
		source.start(when);
		sources.push(source);
	}
	let released = false;
	return {
		release(at) {
			if (released) return;
			released = true;
			gain.gain.cancelScheduledValues(at);
			gain.gain.setTargetAtTime(0.0001, at, 0.03);
			for (const s of sources) s.stop(at + 0.3);
			// The key's release: the damper's felt back on the string, a quiet mechanical
			// sound. The recordings peak as loud as a note, so they go well down (about
			// 40 dB under the note at best, and high-passed) and fade further the longer the note rang,
			// as a sampler's rt_decay does (6 dB a second): a note held ten seconds
			// has nothing left to damp.
			const rel = releases.get(midi - 20);
			const held = at - when;
			if (rel && held > 0.05) {
				const r = ctx.createBufferSource();
				r.buffer = rel;
				// Quieter still for a momentary note (a tap has nothing to hide the sound behind): it grows with the hold up to half a second, then decays.
				const rg = ctx.createGain();
				rg.gain.value = 0.01 * (0.6 + 0.4 * v) * Math.min(1, held / 0.5) * 10 ** (-(6 * held) / 20);
				// The recordings carry a low thump of the mechanism; only the felt's whisper is wanted.
				const hp = ctx.createBiquadFilter();
				hp.type = "highpass";
				hp.frequency.value = 400;
				r.connect(hp);
				hp.connect(rg);
				rg.connect(out);
				r.start(at);
			}
		},
	};
}
