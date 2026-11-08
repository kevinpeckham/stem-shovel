import type { ChordminiRuns } from "#lib/utils/chordminiRuns.js";
import type {
	RecordingFeaturesReply,
	RecordingFeaturesRequest,
} from "#lib/workers/recordingFeatures.worker.js";
import * as Effect from "effect/Effect";
import { type AlignmentFeaturesRecord, readAlignmentFeatures } from "./alignmentFeaturesCache.js";
import {
	type Envelope,
	envelopeOf,
	inWorker,
	keepFeatures,
	keptFeatures,
	WORKER_TIMEOUT,
} from "./alignmentWorkers.js";
import type { RecordingFeatures } from "./chartAlignment.js";
import { type ChartlessGrid, chartlessGrid } from "./chartlessGrid.js";
import { monoOfBuffers } from "./monoOfBuffers.js";

/**
 * The chartless draft's bar grid read off a song's decoded audio
 * (audio/chartlessGrid.ts): the recording's onset envelope and its
 * features (the chromagram and where the sound starts), from the browser's
 * cache when it holds both at the buffers' rate (the same record "Place
 * from chart" keeps, audio/alignmentFeaturesCache.ts), else from two
 * workers at once on the buffers mixed to mono (workers/
 * alignmentEnvelope.worker.ts and workers/recordingFeatures.worker.ts),
 * only for what the cache lacks, the record written after (fire and
 * forget). The reading is a help, never a step that can fail the draft:
 * no Worker, no audio, a worker's error, the 90 s timeout or an aborted
 * `signal` all resolve null, and the draft keeps the declared grid.
 */
export interface ChartlessGridBrowserInput {
	buffers: AudioBuffer[];
	cacheKey: string | null;
	declaredBarSeconds: number;
	beatsPerBar: number;
	startAt: number | null;
	runs: ChordminiRuns | null;
	duration: number;
	/** Aborted when the draft's run is canceled: the workers end with it. */
	signal?: AbortSignal;
}

const featuresWorker = () =>
	new Worker(new URL("../workers/recordingFeatures.worker.ts", import.meta.url), {
		type: "module",
	});

/** The recording's features: the kept ones, or their worker on the mix (transferred). */
function featuresFrom(
	kept: RecordingFeatures | null,
	recording: Float32Array,
	sampleRate: number,
): Effect.Effect<RecordingFeatures, Error> {
	if (kept) return Effect.succeed(kept);
	const request: RecordingFeaturesRequest = { id: 1, recording, sampleRate };
	return inWorker<RecordingFeaturesReply>(featuresWorker, request, [recording.buffer]).pipe(
		Effect.map(({ chroma, frames, hopSec, firstSound, lastSound }) => ({
			chroma,
			frames,
			hopSec,
			firstSound,
			lastSound,
		})),
	);
}

/**
 * The features and the envelope, from the record when it has both at the
 * buffers' rate, else each from the record or its worker (each worker its
 * own copy of the mix when both run); a record is kept when a worker ran.
 */
function readingOf(
	buffers: AudioBuffer[],
	cached: AlignmentFeaturesRecord | null,
	cacheKey: string | null,
): Effect.Effect<[RecordingFeatures, Envelope], Error> {
	const sampleRate = buffers[0]!.sampleRate;
	const kept = keptFeatures(cached, sampleRate);
	if (kept.features && kept.envelope) return Effect.succeed([kept.features, kept.envelope]);
	const samples = monoOfBuffers(buffers).samples;
	const forEnvelope = kept.features || kept.envelope ? samples : samples.slice();
	return Effect.all(
		[
			featuresFrom(kept.features, samples, sampleRate),
			envelopeOf(kept.envelope, forEnvelope, sampleRate),
		],
		{ concurrency: "unbounded" },
	).pipe(
		Effect.timeout(WORKER_TIMEOUT),
		Effect.map(([features, envelope]) => {
			if (cacheKey) keepFeatures(cacheKey, sampleRate, features, envelope);
			return [features, envelope] as [RecordingFeatures, Envelope];
		}),
	);
}

export function chartlessGridInBrowser(
	input: ChartlessGridBrowserInput,
): Promise<ChartlessGrid | null> {
	const { buffers, cacheKey } = input;
	const program = Effect.suspend(() => {
		if (typeof Worker === "undefined" || buffers.length === 0) return Effect.succeed(null);
		return Effect.promise(() =>
			cacheKey ? readAlignmentFeatures(cacheKey) : Promise.resolve(null),
		).pipe(
			Effect.flatMap((cached) => readingOf(buffers, cached, cacheKey)),
			Effect.map(([features, { onset, fps }]) =>
				chartlessGrid({
					onset,
					fps,
					chroma: features.chroma,
					hopSec: features.hopSec,
					firstSound: features.firstSound,
					duration: input.duration,
					declaredBarSeconds: input.declaredBarSeconds,
					beatsPerBar: input.beatsPerBar,
					startAt: input.startAt,
					runs: input.runs,
				}),
			),
		);
	}).pipe(Effect.catchCause(() => Effect.succeed(null)));
	return Effect.runPromise(program, { signal: input.signal }).catch(() => null);
}
