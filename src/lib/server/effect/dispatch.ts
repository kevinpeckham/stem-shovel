/**
 * The post that hands a job to the jobs function (src/lib/server/jobs.ts,
 * docs/effect-adoption.md Phase 2 step 3): bounded by a timeout, and
 * retried once when the failure is the transport's (a network error, a
 * 5xx, the timeout), never on a 4xx: a 401 means the token is wrong and a
 * 400 the body, and neither gets better on a second go.
 */
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";

/** A job post that failed: a status the jobs function answered, a network error or a timeout. */
export class JobDispatchError extends Data.TaggedError("JobDispatchError")<{
	readonly status?: number;
	readonly detail: string;
	readonly cause?: unknown;
}> {
	constructor(args: { status?: number; detail: string; cause?: unknown }) {
		super(args);
		this.message =
			args.status === undefined
				? `jobs: ${args.detail}`
				: `jobs: ${args.detail} answered ${args.status}`;
	}
}

/** The per-attempt timeout and the retry's backoff base; a test turns them down. */
export const DispatchTuning = Context.Reference<{
	readonly timeout: Duration.Input;
	readonly backoff: Duration.Input;
}>("DispatchTuning", {
	defaultValue: () => ({ timeout: "10 seconds", backoff: "500 millis" }),
});

/** Worth one more go: a 5xx, a network error (undici's TypeError), a timeout. */
const isTransport = (e: JobDispatchError) =>
	e.status !== undefined
		? e.status >= 500
		: e.cause instanceof TypeError || Cause.isTimeoutError(e.cause);

/** Posts `body` to the jobs function at `url` with the jobs token; succeeds on any 2xx. */
export function dispatchJob(
	url: string,
	token: string,
	body: { kind: string; ids: string[] },
): Effect.Effect<void, JobDispatchError> {
	const what = `${body.kind} for ${body.ids.length}`;
	return Effect.gen(function* () {
		const tuning = yield* DispatchTuning;
		const once = Effect.tryPromise({
			try: (signal) =>
				fetch(url, {
					method: "POST",
					headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
					body: JSON.stringify(body),
					signal,
				}),
			catch: (cause) =>
				new JobDispatchError({
					detail: `${what} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
					cause,
				}),
		}).pipe(
			Effect.flatMap((res) =>
				res.ok
					? Effect.void
					: Effect.fail(new JobDispatchError({ status: res.status, detail: what })),
			),
			Effect.timeout(tuning.timeout),
			Effect.catchIf(Cause.isTimeoutError, (cause) =>
				Effect.fail(
					new JobDispatchError({
						detail: `${what} timed out after ${Duration.toSeconds(tuning.timeout)} s`,
						cause,
					}),
				),
			),
		);
		return yield* Effect.retry(once, {
			schedule: Schedule.jittered(Schedule.exponential(tuning.backoff)),
			times: 1,
			while: isTransport,
		});
	});
}
