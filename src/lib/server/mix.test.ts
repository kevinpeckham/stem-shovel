import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { describe, expect, test, vi } from "vite-plus/test";
import { BlobError, DbError } from "#lib/server/effect/errors.js";
import { BlobStore, Db, Ffmpeg } from "#lib/server/effect/services.js";
import { JobTuning } from "#lib/server/effect/tuning.js";

// The live layers wrap these modules, and loading the real data.ts opens the
// database; the Effect tests below provide fake layers instead, so these
// stubs only keep the imports from reaching Turso and Blob.
vi.mock("#lib/server/data.js", () => ({}));
vi.mock("#lib/server/blob.js", () => ({
	mixPathname: (_account: string, song: string, key: string) => `songs/${song}/mix-${key}.mp3`,
}));

const { ensureOriginalMixEffect, isOriginal, mixKeyOf, panFilter, parseMixRequest } =
	await import("./mix");
type Mixable = Parameters<typeof parseMixRequest>[0];

const song = {
	id: "s1",
	accountId: "a1",
	title: "Song",
	slug: "song",
	mixUrl: null,
	mixKey: null,
	mixStartedAt: null,
	project: { slug: "proj", account: { name: "Band" } },
	stems: [
		{
			id: "stemA",
			status: "ready",
			url: "https://blob/a.wav",
			channels: 2,
			playbackStatus: "ready",
			playbackUrl: "https://blob/a.m4a",
		},
		{
			id: "stemB",
			status: "ready",
			url: "https://blob/b.wav",
			channels: 1,
			playbackStatus: null,
			playbackUrl: null,
		},
	],
} as unknown as Mixable;

describe("parseMixRequest", () => {
	test("no query is the original: every stem at unity, master 1", () => {
		expect(parseMixRequest(song, new URLSearchParams())).toEqual({
			stems: [
				{ id: "stemA", gain: 1, pan: 0 },
				{ id: "stemB", gain: 1, pan: 0 },
			],
			master: 1,
		});
	});
	test("a custom mix names stems with gains and a master", () => {
		const req = parseMixRequest(
			song,
			new URLSearchParams("stems=stemA:1.000,stemB:0.500&master=0.800"),
		);
		expect(req).toEqual({
			stems: [
				{ id: "stemA", gain: 1, pan: 0 },
				{ id: "stemB", gain: 0.5, pan: 0 },
			],
			master: 0.8,
		});
	});
	test("rejects unknown ids, gains outside the fader range, duplicates, an empty list and a bad master", () => {
		expect(parseMixRequest(song, new URLSearchParams("stems=nope:1"))).toBeNull();
		expect(parseMixRequest(song, new URLSearchParams("stems=stemA:9"))).toBeNull();
		expect(parseMixRequest(song, new URLSearchParams("stems=stemA:0"))).toBeNull();
		expect(parseMixRequest(song, new URLSearchParams("stems=stemA:1,stemA:1"))).toBeNull();
		expect(parseMixRequest(song, new URLSearchParams("stems="))).toBeNull();
		expect(parseMixRequest(song, new URLSearchParams("stems=stemA:1&master=2"))).toBeNull();
	});
});

describe("pans", () => {
	test("a third field is the pan, kept to two places; out of range is refused", () => {
		const req = parseMixRequest(song, new URLSearchParams("stems=stemA:1:-0.5,stemB:1:0.25"));
		expect(req?.stems).toEqual([
			{ id: "stemA", gain: 1, pan: -0.5 },
			{ id: "stemB", gain: 1, pan: 0.25 },
		]);
		expect(parseMixRequest(song, new URLSearchParams("stems=stemA:1:2"))).toBeNull();
	});
	test("the ffmpeg pan filter follows the StereoPanner's stereo law and is nothing at center", () => {
		expect(panFilter(0)).toBe("");
		expect(panFilter(-1)).toBe(",pan=stereo|c0=c0+1.0000*c1|c1=0.0000*c1");
		expect(panFilter(1)).toBe(",pan=stereo|c0=0.0000*c0|c1=c1+1.0000*c0");
		expect(panFilter(0.5)).toBe(",pan=stereo|c0=0.7071*c0|c1=c1+0.7071*c0");
	});
	test("a centered pan leaves the mix key as it was; a pan changes it", () => {
		const centred = mixKeyOf([{ ...song.stems[0]!, pan: 0 }]);
		expect(centred).toBe(mixKeyOf([song.stems[0]!]));
		expect(mixKeyOf([{ ...song.stems[0]!, pan: 0.3 }])).not.toBe(centred);
	});
});

describe("isOriginal", () => {
	test("all stems at unity with master 1 is the original, whatever the order", () => {
		expect(
			isOriginal(song, {
				stems: [
					{ id: "stemB", gain: 1 },
					{ id: "stemA", gain: 1 },
				],
				master: 1,
			}),
		).toBe(true);
		expect(isOriginal(song, { stems: [{ id: "stemA", gain: 1 }], master: 1 })).toBe(false);
		expect(
			isOriginal(song, {
				stems: [
					{ id: "stemA", gain: 1 },
					{ id: "stemB", gain: 0.5 },
				],
				master: 1,
			}),
		).toBe(false);
		expect(
			isOriginal(song, {
				stems: [
					{ id: "stemA", gain: 1 },
					{ id: "stemB", gain: 1 },
				],
				master: 0.9,
			}),
		).toBe(false);
	});
});

describe("mixKeyOf", () => {
	test("depends on which file each stem plays from, in any order", () => {
		const a = mixKeyOf(song.stems);
		const b = mixKeyOf([...song.stems].reverse());
		expect(a).toBe(b);
		expect(a).toHaveLength(16);
		const swapped = mixKeyOf([{ ...song.stems[0], playbackStatus: null }, song.stems[1]]);
		expect(swapped).not.toBe(a);
	});
});

describe("ensureOriginalMixEffect", () => {
	const ready = {
		...song,
		mixUrl: "https://blob/old-mix.mp3",
		mixKey: "stale",
		stems: song.stems.map((s) => ({ ...s, playbackStatus: "ready" })),
	} as unknown as Mixable;

	type Read = (url: string) => Response;
	interface Options {
		read?: Read;
		ffmpeg?: "never";
		setFails?: boolean;
		claim?: boolean;
	}

	/** Fake layers that record what the job did; the Ffmpeg fake writes the output it is given. */
	function fakes({ read = () => new Response("audio"), ffmpeg, setFails, claim = true }: Options) {
		const log = {
			reads: [] as string[],
			puts: [] as string[],
			set: [] as unknown[],
			deleted: [] as string[][],
			released: 0,
			ran: 0,
			dir: "",
		};
		const layer = Layer.mergeAll(
			Layer.succeed(BlobStore, {
				read: (url) => Effect.sync(() => (log.reads.push(url), read(url))),
				put: (pathname) =>
					Effect.sync(() => (log.puts.push(pathname), { url: "https://blob/new-mix.mp3" })),
				delete: (urls) => Effect.sync(() => void log.deleted.push(urls)),
			}),
			Layer.succeed(Db, {
				call: (op) => Effect.die(new Error(`unexpected Db.call ${op}`)),
				songForMix: () => Effect.succeed(ready),
				claimSongMix: () => Effect.succeed(claim),
				releaseSongMix: () => Effect.sync(() => void log.released++),
				setSongMix: (_id, mix) =>
					setFails
						? Effect.fail(new DbError({ op: "setSongMix", cause: new Error("502") }))
						: Effect.sync(() => void log.set.push(mix)),
			}),
			Layer.succeed(Ffmpeg, {
				run: (args) => {
					const output = args.at(-1)!;
					log.ran++;
					log.dir = dirname(output);
					if (ffmpeg === "never") return Effect.never;
					return Effect.promise(() => writeFile(output, "mp3")).pipe(
						Effect.as({ stdout: "", stderr: "" }),
					);
				},
				stream: () => Effect.die(new Error("the mix does not stream")),
			}),
		);
		return { log, layer };
	}

	function run(options: Options) {
		const { log, layer } = fakes(options);
		const job = ensureOriginalMixEffect("s1").pipe(
			Effect.provide(layer),
			Effect.provideService(JobTuning, { retryBase: "1 millis", ffmpegTimeout: "50 millis" }),
		);
		return Effect.runPromiseExit(job).then((exit) => ({ exit, log }));
	}

	async function gone(dir: string) {
		expect(dir).not.toBe("");
		await expect(stat(dir)).rejects.toThrow(/ENOENT/);
	}

	function failure(exit: Exit.Exit<unknown, unknown>) {
		if (!Exit.isFailure(exit)) throw new Error("expected a failure");
		return Cause.squash(exit.cause);
	}

	/** The job's temp dirs still in the system temp dir (mix.ts is the only maker of mix-*). */
	async function mixDirs() {
		return (await readdir(tmpdir())).filter((d) => d.startsWith("mix-"));
	}

	test("puts the mix, sets the row, deletes the old mix and removes the temp dir", async () => {
		const { exit, log } = await run({});
		expect(Exit.isSuccess(exit)).toBe(true);
		expect(log.reads).toEqual(["https://blob/a.m4a", "https://blob/b.wav"]);
		expect(log.puts).toHaveLength(1);
		expect(log.set).toEqual([{ url: "https://blob/new-mix.mp3", key: expect.any(String) }]);
		expect(log.deleted).toEqual([["https://blob/old-mix.mp3"]]);
		expect(log.released).toBe(0);
		await gone(log.dir);
	});

	test("a 404 fails at once with a BlobError, releases the claim and removes the dir", async () => {
		const before = await mixDirs();
		const { exit, log } = await run({
			read: (url) =>
				url.endsWith("b.wav") ? new Response(null, { status: 404 }) : new Response("audio"),
		});
		const error = failure(exit);
		expect(error).toBeInstanceOf(BlobError);
		expect((error as BlobError).status).toBe(404);
		expect(log.reads.filter((u) => u.endsWith("b.wav"))).toHaveLength(1);
		expect(log.ran).toBe(0);
		expect(log.released).toBe(1);
		expect(await mixDirs()).toEqual(before);
	});

	test("a read answering 503 twice is retried and the job succeeds", async () => {
		let misses = 0;
		const { exit, log } = await run({
			read: (url) =>
				url.endsWith("b.wav") && misses++ < 2
					? new Response(null, { status: 503 })
					: new Response("audio"),
		});
		expect(Exit.isSuccess(exit)).toBe(true);
		expect(log.reads.filter((u) => u.endsWith("b.wav"))).toHaveLength(3);
		expect(log.set).toHaveLength(1);
		await gone(log.dir);
	});

	test("an ffmpeg that never finishes times out, releases the claim and removes the dir", async () => {
		const { exit, log } = await run({ ffmpeg: "never" });
		expect((failure(exit) as { _tag: string })._tag).toBe("TimeoutError");
		expect(log.released).toBe(1);
		expect(log.puts).toHaveLength(0);
		await gone(log.dir);
	});

	test("setSongMix failing is a DbError and releases the claim", async () => {
		const { exit, log } = await run({ setFails: true });
		expect(failure(exit)).toBeInstanceOf(DbError);
		expect(log.released).toBe(1);
		expect(log.deleted).toHaveLength(0);
		await gone(log.dir);
	});

	test("a refused claim renders nothing", async () => {
		const { exit, log } = await run({ claim: false });
		expect(Exit.isSuccess(exit)).toBe(true);
		expect(log.reads).toHaveLength(0);
		expect(log.ran).toBe(0);
		expect(log.released).toBe(0);
	});
});
