import type { ChartBar } from "#lib/utils/barmarkChartBars.js";
import type { AlignChartReply, AlignChartRequest } from "#lib/workers/alignChart.worker.js";
import type {
	AlignmentEnvelopeReply,
	AlignmentEnvelopeRequest,
} from "#lib/workers/alignmentEnvelope.worker.js";
import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import {
	type AlignmentFeaturesRecord,
	readAlignmentFeatures,
	writeAlignmentFeatures,
} from "./alignmentFeaturesCache.js";
import { type Alignment, type RecordingFeatures, repairAlignment } from "./chartAlignment.js";

/**
 * A chart aligned to a song's decoded audio in two workers at once: the
 * warping path (workers/alignChart.worker.ts) and the recording's onset
 * envelope (workers/alignmentEnvelope.worker.ts), the end repair applied
 * here once both answer (`repairAlignment`, milliseconds). The buffers (a
 * mix, or every stem) are summed to one mono track at the first buffer's
 * rate, channels averaged, as long as the longest, a buffer at another rate
 * resampled linearly on the way in; each worker gets its own copy. Each
 * worker is an Effect resource (`acquireUseRelease`) terminated when it
 * answers, fails, the pair passes the 90 s `Effect.timeout`, or the run is
 * interrupted (one failing interrupts the other). Never throws: no Worker,
 * a failure in either, or the timeout fails with an `Error` whose message is
 * a sentence the page can show (`alignChartInBrowser` rejects with it).
 * Given a cache key (utils/alignmentFeaturesKey.ts), the recording's own
 * features (its chromagram, audible span and onset envelope) come from the
 * browser's cache when it holds them (audio/alignmentFeaturesCache.ts), so
 * a second alignment after a chart edit runs only the chart's render and
 * the warping; a miss computes them as before and keeps them.
 */
const TIMEOUT = Duration.seconds(90);

/** One buffer's channels averaged and added into `out` (at `rate`), resampled by linear interpolation when its own rate differs. */
function addMono(out: Float32Array, buffer: AudioBuffer, rate: number): void {
	const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
		buffer.getChannelData(c),
	);
	const step = buffer.sampleRate / rate;
	const scale = 1 / Math.max(1, channels.length);
	const frames = Math.min(out.length, Math.floor((buffer.length - 1) / step) + 1);
	for (let i = 0; i < frames; i++) {
		const x = i * step;
		const k = Math.floor(x);
		const t = x - k;
		for (const data of channels)
			out[i]! += (data[k]! + t * ((data[k + 1] ?? data[k]!) - data[k]!)) * scale;
	}
}

function mono(buffers: AudioBuffer[]): { samples: Float32Array; sampleRate: number } {
	const sampleRate = buffers[0]!.sampleRate;
	const length = Math.max(...buffers.map((b) => Math.ceil((b.length * sampleRate) / b.sampleRate)));
	const samples = new Float32Array(length);
	for (const buffer of buffers) addMono(samples, buffer, sampleRate);
	return { samples, sampleRate };
}

type Answer<R> = Exclude<R, { error: string }>;

/** The message exchange: posts the request (`transfer` moved, not copied) and settles on the worker's answer or its error event. */
function exchange<R extends { id: number }>(
	worker: Worker,
	request: object,
	transfer: Transferable[],
): Effect.Effect<Answer<R>, Error> {
	return Effect.callback<Answer<R>, Error>((resume) => {
		worker.onmessage = (e: MessageEvent<R | { id: number; error: string }>) =>
			resume(
				"error" in e.data
					? Effect.fail(new Error(e.data.error))
					: Effect.succeed(e.data as Answer<R>),
			);
		worker.onerror = () =>
			resume(Effect.fail(new Error("Aligning the chart failed in the browser")));
		worker.postMessage(request, transfer);
	});
}

/** One request in a worker of its own, terminated however the exchange ends. */
function inWorker<R extends { id: number }>(
	spawn: () => Worker,
	request: object,
	transfer: Transferable[],
) {
	return Effect.acquireUseRelease(
		Effect.sync(spawn),
		(worker) => exchange<R>(worker, request, transfer),
		(worker) => Effect.sync(() => worker.terminate()),
	);
}

const pathWorker = () =>
	new Worker(new URL("../workers/alignChart.worker.ts", import.meta.url), { type: "module" });
const envelopeWorker = () =>
	new Worker(new URL("../workers/alignmentEnvelope.worker.ts", import.meta.url), {
		type: "module",
	});

type Envelope = { onset: Float32Array; fps: number };

/** What a kept record gives at the mix's rate: the recording's features and its envelope, each null when it lacks them (a record at another rate gives neither). */
function fromCache(cached: AlignmentFeaturesRecord | null, sampleRate: number) {
	if (cached?.sampleRate !== sampleRate) return { features: null, envelope: null };
	const { chroma, frames, hopSec, firstSound, lastSound, onset, fps } = cached;
	const features: RecordingFeatures = { chroma, frames, hopSec, firstSound, lastSound };
	return { features, envelope: onset && fps !== null ? { onset, fps } : null };
}

/** The envelope: the kept one, or its worker on the mix. */
function envelopeOf(
	kept: Envelope | null,
	recording: Float32Array | null,
	sampleRate: number,
): Effect.Effect<Envelope, Error> {
	if (kept) return Effect.succeed(kept);
	const request: AlignmentEnvelopeRequest = { id: 1, recording: recording!, sampleRate };
	return inWorker<AlignmentEnvelopeReply>(envelopeWorker, request, [recording!.buffer]);
}

/**
 * The two answers, from the workers or the cache: the path worker given the
 * cached features when there are some (no recording), else the mono mix;
 * the envelope from the cache when it holds one, else its worker on the mix
 * (its own copy when the path worker takes the mix too). The mix is only
 * made when a worker needs it. Writes the record (fire and forget) when the
 * workers computed something the cache lacked.
 */
function alignWithCache(
	bars: ChartBar[],
	buffers: AudioBuffer[],
	cached: AlignmentFeaturesRecord | null,
	cacheKey: string | null,
): Effect.Effect<Alignment, Error> {
	const sampleRate = buffers[0]!.sampleRate;
	const { features, envelope: keptEnvelope } = fromCache(cached, sampleRate);
	const full = features !== null && keptEnvelope !== null;
	const samples = full ? null : mono(buffers).samples;
	const shape = bars.map(({ chords, bpm, meter }) => ({ chords, bpm, meter }));
	const path = features
		? inWorker<AlignChartReply>(pathWorker, { id: 1, bars: shape, features, sampleRate }, [])
		: inWorker<AlignChartReply>(
				pathWorker,
				{ id: 1, bars: shape, recording: samples!, sampleRate } satisfies AlignChartRequest,
				[samples!.buffer],
			);
	const envelope = envelopeOf(keptEnvelope, features ? samples : samples!.slice(), sampleRate);
	return Effect.all([path, envelope], { concurrency: "unbounded" }).pipe(
		Effect.timeout(TIMEOUT),
		Effect.catchIf(Cause.isTimeoutError, () =>
			Effect.fail(new Error("Aligning the chart took too long")),
		),
		Effect.map(([answer, { onset, fps }]) => {
			const kept = features ?? answer.features;
			if (cacheKey && kept && !full)
				void writeAlignmentFeatures(cacheKey, {
					key: cacheKey,
					at: Date.now(),
					sampleRate,
					...kept,
					onset,
					fps,
				});
			return repairAlignment(answer.path, { onset, fps });
		}),
	);
}

/** The alignment as an Effect: fails with an `Error` whose message the page can show. */
function alignChartEffect(
	bars: ChartBar[],
	buffers: AudioBuffer[],
	cacheKey: string | null,
): Effect.Effect<Alignment, Error> {
	return Effect.suspend(() => {
		if (typeof Worker === "undefined")
			return Effect.fail(new Error("This browser cannot align the chart"));
		if (buffers.length === 0)
			return Effect.fail(new Error("There is no audio to align the chart to"));
		return Effect.promise(() =>
			cacheKey ? readAlignmentFeatures(cacheKey) : Promise.resolve(null),
		).pipe(Effect.flatMap((cached) => alignWithCache(bars, buffers, cached, cacheKey)));
	});
}

export function alignChartInBrowser(
	bars: ChartBar[],
	buffers: AudioBuffer[],
	cacheKey: string | null = null,
): Promise<Alignment> {
	return Effect.runPromise(alignChartEffect(bars, buffers, cacheKey));
}
