import type { ChartBar } from "#lib/utils/barmarkChartBars.js";
import type { AlignChartReply, AlignChartRequest } from "#lib/workers/alignChart.worker.js";
import type {
	AlignmentEnvelopeReply,
	AlignmentEnvelopeRequest,
} from "#lib/workers/alignmentEnvelope.worker.js";
import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { type Alignment, repairAlignment } from "./chartAlignment.js";

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

/** The message exchange: posts the request (its recording transferred) and settles on the worker's answer or its error event. */
function exchange<R extends { id: number }>(
	worker: Worker,
	request: { recording: Float32Array },
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
		worker.postMessage(request, [request.recording.buffer]);
	});
}

/** One request in a worker of its own, terminated however the exchange ends. */
function inWorker<R extends { id: number }>(
	spawn: () => Worker,
	request: { recording: Float32Array },
) {
	return Effect.acquireUseRelease(
		Effect.sync(spawn),
		(worker) => exchange<R>(worker, request),
		(worker) => Effect.sync(() => worker.terminate()),
	);
}

/** The alignment as an Effect: fails with an `Error` whose message the page can show. */
function alignChartEffect(
	bars: ChartBar[],
	buffers: AudioBuffer[],
): Effect.Effect<Alignment, Error> {
	return Effect.suspend(() => {
		if (typeof Worker === "undefined")
			return Effect.fail(new Error("This browser cannot align the chart"));
		if (buffers.length === 0)
			return Effect.fail(new Error("There is no audio to align the chart to"));
		const { samples, sampleRate } = mono(buffers);
		const pathRequest: AlignChartRequest = {
			id: 1,
			bars: bars.map(({ chords, bpm, meter }) => ({ chords, bpm, meter })),
			recording: samples,
			sampleRate,
		};
		const envelopeRequest: AlignmentEnvelopeRequest = {
			id: 1,
			recording: samples.slice(),
			sampleRate,
		};
		return Effect.all(
			[
				inWorker<AlignChartReply>(
					() =>
						new Worker(new URL("../workers/alignChart.worker.ts", import.meta.url), {
							type: "module",
						}),
					pathRequest,
				),
				inWorker<AlignmentEnvelopeReply>(
					() =>
						new Worker(new URL("../workers/alignmentEnvelope.worker.ts", import.meta.url), {
							type: "module",
						}),
					envelopeRequest,
				),
			],
			{ concurrency: "unbounded" },
		).pipe(
			Effect.timeout(TIMEOUT),
			Effect.catchIf(Cause.isTimeoutError, () =>
				Effect.fail(new Error("Aligning the chart took too long")),
			),
			Effect.map(([{ path }, envelope]) => repairAlignment(path, envelope)),
		);
	});
}

export function alignChartInBrowser(bars: ChartBar[], buffers: AudioBuffer[]): Promise<Alignment> {
	return Effect.runPromise(alignChartEffect(bars, buffers));
}
