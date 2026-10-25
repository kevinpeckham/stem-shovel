import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import { DispatchTuning, dispatchJob, JobDispatchError } from "./dispatch";

const fast = { timeout: "50 millis", backoff: "1 millis" } as const;
const JOBS_URL = "http://localhost:5173/api/jobs";
const body = { kind: "mix", ids: ["a", "b"] };

/** A fetch that answers from a script: a status, a thrown error, or a hang until aborted. */
function stubFetch(script: (number | Error | "hang")[]) {
	const signals: AbortSignal[] = [];
	const fetch = vi.fn((_url: string, init: RequestInit) => {
		signals.push(init.signal!);
		const next = script.shift()!;
		if (next === "hang") return new Promise<Response>(() => {});
		if (next instanceof Error) return Promise.reject(next);
		return Promise.resolve(new Response(null, { status: next }));
	});
	vi.stubGlobal("fetch", fetch);
	return { fetch, signals };
}

const run = () =>
	Effect.runPromise(
		dispatchJob(JOBS_URL, "tok", body).pipe(Effect.provideService(DispatchTuning, fast)),
	);
const fail = () =>
	Effect.runPromise(
		dispatchJob(JOBS_URL, "tok", body).pipe(
			Effect.flip,
			Effect.provideService(DispatchTuning, fast),
		),
	);

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("dispatchJob", () => {
	it("posts the job with the token", async () => {
		const { fetch } = stubFetch([202]);
		await run();
		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = fetch.mock.calls[0]!;
		expect(url).toBe(JOBS_URL);
		expect(init).toMatchObject({ method: "POST", body: JSON.stringify(body) });
		expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
	});
	it("a 503, then a 202: one retry", async () => {
		const { fetch } = stubFetch([503, 202]);
		await run();
		expect(fetch).toHaveBeenCalledTimes(2);
	});
	it("a 401 is not retried, and the error carries the status", async () => {
		const { fetch } = stubFetch([401, 202]);
		const e = await fail();
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(e).toBeInstanceOf(JobDispatchError);
		expect(e.status).toBe(401);
		expect(e.message).toBe("jobs: mix for 2 answered 401");
	});
	it("a network error (TypeError), then a 202: one retry", async () => {
		const { fetch } = stubFetch([new TypeError("fetch failed"), 202]);
		await run();
		expect(fetch).toHaveBeenCalledTimes(2);
	});
	it("two 5xx in a row: the second is the error", async () => {
		const { fetch } = stubFetch([502, 503, 202]);
		const e = await fail();
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(e.status).toBe(503);
	});
	it("a hang times out, aborts the request, and is retried once", async () => {
		const { fetch, signals } = stubFetch(["hang", "hang"]);
		const e = await fail();
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(e.status).toBeUndefined();
		expect(e.message).toMatch(/timed out/);
		expect(signals.every((s) => s.aborted)).toBe(true);
	});
});
