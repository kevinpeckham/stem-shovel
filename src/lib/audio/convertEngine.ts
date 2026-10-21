import { mixClipsToChannels, type ClipSource } from "#lib/utils/mixClipsToChannels.js";
import { panWeightsOf } from "#lib/utils/panBalance.js";
import type { StudioArrangement, StudioTrack } from "#lib/val/StudioSchema.js";
import type { ExportEngine } from "./studioExport.js";

/**
 * An export engine over a project read from a file (the converter page,
 * docs/dawproject-plan.md "Roadmap"), with no Studio behind it: a track
 * renders as its clips mixed (gain, fades, crossfades) through its fader
 * and pan (the mixer's pan law, utils/panBalance.ts) and its mute or the
 * solo of others; a bus as the sum of the tracks routed to it through its
 * own fader and pan; the mix as the tracks that go straight to the master
 * plus the buses, through the master fader. Inserts, sends and automation
 * are not rendered (the DAWproject keeps the automation). A MIDI track has
 * no instrument here, so it is not renderable: its notes go to the MIDI
 * file. Buffers are real `AudioBuffer`s in the browser and plain objects
 * where there is none (tests).
 */
export function convertEngine(
	arrangement: StudioArrangement,
	sources: Map<string, ClipSource>,
): ExportEngine {
	const rates = [...sources.values()].map((s) => s.sampleRate);
	const sampleRate = rates.length ? Math.max(...rates) : 48000;
	const songEnd = arrangement.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
	const sourceOf = (id: string) => sources.get(id) ?? null;
	const anySolo = arrangement.tracks.some((t) => t.solo);
	const renders = (trackId: string) =>
		arrangement.tracks.find((t) => t.id === trackId)?.kind !== "midi";

	/** A track through its strip: silent when muted or when others are soloed. */
	const trackChannels = (t: StudioTrack): Float32Array[] => {
		const length = Math.max(1, Math.round(songEnd * sampleRate));
		if (!renders(t.id) || t.muted || (anySolo && !t.solo))
			return [new Float32Array(length), new Float32Array(length)];
		const clips = arrangement.clips.filter((c) => c.trackId === t.id && c.sourceId);
		const mixed = mixClipsToChannels(clips, sourceOf, { from: 0, to: songEnd, sampleRate });
		const mono = clips.every((c) => (sourceOf(c.sourceId!)?.channels.length ?? 2) === 1);
		return strip(mixed, t.gain, t.pan, mono);
	};
	const busChannels = (busId: string): Float32Array[] => {
		const bus = (arrangement.buses ?? []).find((b) => b.id === busId);
		const sum = sumOf(
			arrangement.tracks.filter((t) => t.output === busId).map(trackChannels),
			Math.max(1, Math.round(songEnd * sampleRate)),
		);
		return bus && !bus.muted
			? strip(sum, bus.gain, bus.pan, false)
			: sum.map((ch) => new Float32Array(ch.length));
	};
	return {
		arrangement,
		bufferOf: (id) => {
			const s = sources.get(id);
			return s ? bufferOf(s.channels, s.sampleRate) : null;
		},
		renders,
		async render(target) {
			if (target?.track) return bufferOf(trackChannels(trackOf(target.track)), sampleRate);
			if (target?.bus) return bufferOf(busChannels(target.bus), sampleRate);
			const length = Math.max(1, Math.round(songEnd * sampleRate));
			const direct = arrangement.tracks
				.filter((t) => !t.output || !(arrangement.buses ?? []).some((b) => b.id === t.output))
				.map(trackChannels);
			const buses = (arrangement.buses ?? []).map((b) => busChannels(b.id));
			const mix = sumOf([...direct, ...buses], length);
			return bufferOf(
				mix.map((ch) => ch.map((v) => v * arrangement.master)),
				sampleRate,
			);
		},
	};
	function trackOf(id: string): StudioTrack {
		const t = arrangement.tracks.find((x) => x.id === id);
		if (!t) throw new Error(`No track ${id}`);
		return t;
	}
}

/** Fader and pan over a stereo pair (a mono source pans as a position, a stereo one as a balance). */
function strip(channels: Float32Array[], gain: number, pan: number, mono: boolean): Float32Array[] {
	const w = panWeightsOf(pan, mono);
	const [l, r] = [channels[0]!, channels[1] ?? channels[0]!];
	const out = [new Float32Array(l.length), new Float32Array(l.length)];
	for (let i = 0; i < l.length; i++) {
		// A mono source: both channels carry the same signal, placed; a stereo one: balanced.
		const left = mono ? l[i]! : l[i]!;
		const right = mono ? l[i]! : r[i]!;
		out[0]![i] = (left * w.ll + right * w.lr) * gain;
		out[1]![i] = (left * w.rl + right * w.rr) * gain;
	}
	return out;
}

function sumOf(parts: Float32Array[][], length: number): Float32Array[] {
	const out = [new Float32Array(length), new Float32Array(length)];
	for (const p of parts)
		for (let ch = 0; ch < 2; ch++) {
			const src = p[ch] ?? p[0]!;
			const n = Math.min(length, src.length);
			for (let i = 0; i < n; i++) out[ch]![i] += src[i]!;
		}
	return out;
}

/** An AudioBuffer where the platform has one, else an object with the same reads. */
function bufferOf(channels: Float32Array[], sampleRate: number): AudioBuffer {
	const length = channels[0]?.length ?? 0;
	if (typeof AudioBuffer !== "undefined") {
		const b = new AudioBuffer({
			length: Math.max(1, length),
			sampleRate,
			numberOfChannels: channels.length,
		});
		channels.forEach((ch, i) => b.copyToChannel(new Float32Array(ch), i));
		return b;
	}
	return {
		sampleRate,
		length,
		duration: length / sampleRate,
		numberOfChannels: channels.length,
		getChannelData: (c: number) => channels[c]!,
	} as unknown as AudioBuffer;
}
