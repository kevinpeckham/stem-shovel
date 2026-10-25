import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import { FFMPEG_TIMEOUT_MS } from "#lib/constants/ffmpegTimeout.js";

/**
 * A job's retry base delay and ffmpeg's time limit. Production uses the
 * defaults; a test of any job provides shorter ones with
 * `Effect.provideService(JobTuning, …)`.
 */
export const JobTuning = Context.Reference<{
	readonly retryBase: Duration.Input;
	readonly ffmpegTimeout: Duration.Input;
}>("JobTuning", {
	defaultValue: () => ({
		retryBase: "500 millis",
		ffmpegTimeout: Duration.millis(FFMPEG_TIMEOUT_MS),
	}),
});
