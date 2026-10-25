import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { BlobError } from "./errors.js";

// The live layers in services.ts wrap these; the tests provide a fake BlobStore.
vi.mock("#lib/server/data.js", () => ({}));
vi.mock("#lib/server/blob.js", () => ({}));

const { downloadToFile } = await import("./blobIo.js");
const { BlobStore } = await import("./services.js");
const { JobTuning } = await import("./tuning.js");

const URL = "https://store.public.blob.vercel-storage.com/a.wav";

/** A store whose reads answer from `answers` in turn (a Response, or an Error the read throws). */
function store(answers: (Response | Error)[]) {
	const calls = { reads: 0 };
	const layer = Layer.succeed(BlobStore, {
		read: (url) => {
			const answer = answers[Math.min(calls.reads++, answers.length - 1)]!;
			return answer instanceof Error
				? Effect.fail(new BlobError({ op: "read", url, cause: answer }))
				: Effect.succeed(answer);
		},
		put: () => Effect.die(new Error("no puts here")),
		delete: () => Effect.die(new Error("no deletes here")),
	});
	return { calls, layer };
}

let dir = "";
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "blobio-test-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

function download(answers: (Response | Error)[]) {
	const { calls, layer } = store(answers);
	const file = join(dir, "out");
	const job = downloadToFile(URL, file).pipe(
		Effect.provide(layer),
		Effect.provideService(JobTuning, { retryBase: "1 millis", ffmpegTimeout: "1 second" }),
	);
	return Effect.runPromiseExit(job).then((exit) => ({ exit, calls, file }));
}

function failure(exit: Exit.Exit<unknown, unknown>) {
	if (!Exit.isFailure(exit)) throw new Error("expected a failure");
	return Cause.squash(exit.cause) as BlobError;
}

describe("downloadToFile", () => {
	test("writes the body to the file", async () => {
		const { exit, calls, file } = await download([new Response("audio")]);
		expect(Exit.isSuccess(exit)).toBe(true);
		expect(calls.reads).toBe(1);
		expect(await readFile(file, "utf8")).toBe("audio");
	});

	test("a 404 fails at once with its status", async () => {
		const { exit, calls } = await download([new Response(null, { status: 404 })]);
		expect(failure(exit)).toMatchObject({ _tag: "BlobError", status: 404 });
		expect(calls.reads).toBe(1);
	});

	test("a 503 is retried and the next 200 is written", async () => {
		const { exit, calls, file } = await download([
			new Response(null, { status: 503 }),
			new Response("audio"),
		]);
		expect(Exit.isSuccess(exit)).toBe(true);
		expect(calls.reads).toBe(2);
		expect(await readFile(file, "utf8")).toBe("audio");
	});

	test("a plain thrown Error (a refused URL) is not retried", async () => {
		const { exit, calls } = await download([new Error("not one of our stores")]);
		expect(failure(exit).cause).toBeInstanceOf(Error);
		expect(calls.reads).toBe(1);
	});

	test("a TypeError (undici's fetch failed) is retried, at most three times", async () => {
		const { exit, calls } = await download([new TypeError("fetch failed")]);
		expect(failure(exit).cause).toBeInstanceOf(TypeError);
		expect(calls.reads).toBe(4);
	});
});
