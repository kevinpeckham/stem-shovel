import {
	type Declared,
	findGrid,
	type GridReading,
	type ListenChordRuns,
	type PlacedGrid,
	type RefusalReason,
} from "@barmark/listen";
import * as Effect from "effect/Effect";
import { recordingFeaturesOf, WORKER_TIMEOUT } from "./alignmentWorkers.js";

/**
 * The chartless draft's bar grid read off a song's decoded audio
 * (@barmark/listen's `findGrid`, stem-bench Studies 28 to 31c): the
 * recording's features (audio/alignmentWorkers.ts: the browser's cache, the
 * same record "Place from chart" keeps, else two workers at once on the
 * buffers mixed to mono), then the grid on the page (milliseconds). The
 * reading is a help, never a step that can fail the draft: no Worker, no
 * audio, a worker's error, the 90 s timeout or an aborted `signal` all
 * resolve the `unavailable` refusal (no reading), and the draft keeps the
 * declared grid; the grid's own refusals pass through with their reading.
 */
export interface ChartlessGridBrowserInput {
	buffers: AudioBuffer[];
	cacheKey: string | null;
	/** The song's meter and tempo at its start, the tempo in barmark's beat (utils/listenDeclared.ts). */
	declared: Declared;
	startAt: number | null;
	runs: ListenChordRuns | null;
	/** Aborted when the draft's run is canceled: the workers end with it. */
	signal?: AbortSignal;
}

/**
 * Why no grid was placed: the package's reason and its words, with the
 * reading (the witnesses, when the vote was undecided); or `unavailable`,
 * the browser's own (no Worker, no audio, a worker's error, the timeout or
 * a cancel).
 */
export interface ChartlessRefusal {
	ok: false;
	reason: RefusalReason | "unavailable";
	message: string;
	reading: GridReading | null;
}

/** The read's answer: the placed grid, or the refusal and why. */
export type ChartlessGridResult = { ok: true; placed: PlacedGrid } | ChartlessRefusal;

export const UNAVAILABLE: ChartlessRefusal = {
	ok: false,
	reason: "unavailable",
	message: "",
	reading: null,
};

/** The package's answer as the draft's. */
function resultOf(result: ReturnType<typeof findGrid>): ChartlessGridResult {
	if (result.ok) return { ok: true, placed: result.value };
	const { reason, message } = result.refusals[0]!;
	return { ok: false, reason, message, reading: result.reading };
}

export function chartlessGridInBrowser(
	input: ChartlessGridBrowserInput,
): Promise<ChartlessGridResult> {
	const { buffers, cacheKey } = input;
	const program = Effect.suspend((): Effect.Effect<ChartlessGridResult, Error> => {
		if (typeof Worker === "undefined" || buffers.length === 0) return Effect.succeed(UNAVAILABLE);
		return recordingFeaturesOf(buffers, cacheKey).pipe(
			Effect.timeout(WORKER_TIMEOUT),
			Effect.map((features) =>
				resultOf(
					findGrid({
						features,
						chords: input.runs,
						declared: input.declared,
						startAt: input.startAt,
					}),
				),
			),
		);
	}).pipe(Effect.catchCause(() => Effect.succeed(UNAVAILABLE)));
	return Effect.runPromise(program, { signal: input.signal }).catch(() => UNAVAILABLE);
}
