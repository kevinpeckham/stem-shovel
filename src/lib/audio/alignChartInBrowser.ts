import type { ChartBar } from "#lib/utils/barmarkChartBars.js";
import type { AlignChartReply, AlignChartRequest } from "#lib/workers/alignChart.worker.js";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { type AlignmentFeaturesRecord, readAlignmentFeatures } from "./alignmentFeaturesCache.js";
import {
	envelopeOf,
	inWorker,
	keepFeatures,
	keptFeatures,
	WORKER_TIMEOUT,
} from "./alignmentWorkers.js";
import { type Alignment, repairAlignment } from "./chartAlignment.js";
import { monoOfBuffers } from "./monoOfBuffers.js";

/**
 * A chart aligned to a song's decoded audio in two workers at once: the
 * warping path (workers/alignChart.worker.ts) and the recording's onset
 * envelope (workers/alignmentEnvelope.worker.ts), the grid re-phase applied
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
const pathWorker = () =>
	new Worker(new URL("../workers/alignChart.worker.ts", import.meta.url), { type: "module" });

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
	const { features, envelope: keptEnvelope } = keptFeatures(cached, sampleRate);
	const full = features !== null && keptEnvelope !== null;
	const samples = full ? null : monoOfBuffers(buffers).samples;
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
		Effect.timeout(WORKER_TIMEOUT),
		Effect.catchIf(Cause.isTimeoutError, () =>
			Effect.fail(new Error("Aligning the chart took too long")),
		),
		Effect.map(([answer, envelope]) => {
			const kept = features ?? answer.features;
			if (cacheKey && kept && !full) keepFeatures(cacheKey, sampleRate, kept, envelope);
			return repairAlignment(answer.path, envelope);
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
