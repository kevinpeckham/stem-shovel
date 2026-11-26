import type { AlignChartReply, AlignChartRequest } from "#lib/workers/alignChart.worker.js";
import type {
	AlignInput,
	Alignment,
	ListenWarning,
	Placements,
	Refusal,
	RefusalReason,
} from "@barmark/listen";
import type { TimingMap } from "@barmark/sync";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { inWorker, recordingFeaturesOf, WORKER_TIMEOUT } from "./alignmentWorkers.js";

/**
 * A chart aligned to a song's decoded audio (@barmark/listen's
 * `alignChart`, stem-bench Study 12): the recording's features
 * (audio/alignmentWorkers.ts: the browser's cache, else two workers at
 * once on the buffers mixed to mono), then the alignment in a worker of its
 * own (workers/alignChart.worker.ts), the whole under the 90 s
 * `Effect.timeout`. The answer is the alignment and what it places, with
 * the timing map when the package kept one and its refusals when it did
 * not (a refusal after the warping still aligned the chart: the page
 * places its sections). Never throws: no Worker, no audio, a worker's
 * failure, the timeout, or a refusal before the warping (the chart plays
 * no bars, the recording is too long …) fails with an `Error` whose message
 * is a sentence the page can show (`alignChartInBrowser` rejects with it).
 */
export interface ChartAlignment {
	alignment: Alignment;
	placements: Placements;
	/** The aligned chart's timing map; null when the package refused it (`refusals` say why). */
	timing: TimingMap | null;
	/** Why there is no map: the fit, the same-piece gate, a flat envelope; [] when there is one. */
	refusals: Refusal[];
	warnings: ListenWarning[];
}

/** What the alignment reads besides the recording's features. */
export type ChartAlignInput = Omit<AlignInput, "features">;

const alignWorker = () =>
	new Worker(new URL("../workers/alignChart.worker.ts", import.meta.url), { type: "module" });

/** The page's sentences for the refusals before the warping (the ones `alignChartPath` threw); another reason is said in the package's words. */
const BEFORE_WARPING: Partial<Record<RefusalReason, string>> = {
	"no-bars": "The chart has no bars to place",
	"no-tempo": "The chart has no bars to place",
	"too-short": "The recording or the chart is too short to align",
	"too-long": "The recording is too long to align in the browser",
	"chart-too-long": "The chart runs more than twice as long as the recording; check its tempo",
};

type AlignResult = Extract<AlignChartReply, { result: unknown }>["result"];

/** The package's answer as the page's: the aligned chart, or the sentence for a refusal before the warping. */
function chartAlignmentOf(result: AlignResult): Effect.Effect<ChartAlignment, Error> {
	if (result.ok) {
		const { alignment, placements, timing } = result.value;
		return Effect.succeed({
			alignment,
			placements,
			timing,
			refusals: [],
			warnings: result.warnings,
		});
	}
	const { alignment, placements, refusals, warnings } = result;
	if (alignment && placements)
		return Effect.succeed({ alignment, placements, timing: null, refusals, warnings });
	const first = refusals[0]!;
	return Effect.fail(new Error(BEFORE_WARPING[first.reason] ?? first.message));
}

/** The alignment as an Effect: fails with an `Error` whose message the page can show. */
function alignChartEffect(
	input: ChartAlignInput,
	buffers: AudioBuffer[],
	cacheKey: string | null,
): Effect.Effect<ChartAlignment, Error> {
	return Effect.suspend(() => {
		if (typeof Worker === "undefined")
			return Effect.fail(new Error("This browser cannot align the chart"));
		if (buffers.length === 0)
			return Effect.fail(new Error("There is no audio to align the chart to"));
		return recordingFeaturesOf(buffers, cacheKey).pipe(
			Effect.flatMap((features) => {
				const request: AlignChartRequest = { id: 1, input: { ...input, features } };
				return inWorker<AlignChartReply>(alignWorker, request, []);
			}),
			Effect.timeout(WORKER_TIMEOUT),
			Effect.catchIf(Cause.isTimeoutError, () =>
				Effect.fail(new Error("Aligning the chart took too long")),
			),
			Effect.flatMap(({ result }) => chartAlignmentOf(result)),
		);
	});
}

export function alignChartInBrowser(
	input: ChartAlignInput,
	buffers: AudioBuffer[],
	cacheKey: string | null = null,
): Promise<ChartAlignment> {
	return Effect.runPromise(alignChartEffect(input, buffers, cacheKey));
}
