import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Writable } from "node:stream";

/**
 * The ffmpeg invocations behind the playback renditions, with ffmpeg, the
 * file system, Blob and the data layer doubled: what argv each rendition
 * runs with, which rows are claimed, finished or failed, what is written
 * to Blob under which name and store, and that the temporary directory
 * goes whatever happens. No audio is processed.
 */
const h = vi.hoisted(() => ({
	/** Every execFile call's argv; a handler decides what ffmpeg "answers". */
	runs: [] as string[][],
	answer: vi.fn<(args: string[]) => { stderr: string } | Error>(),
	data: {
		claimPlayback: vi.fn(),
		finishPlayback: vi.fn(),
		failPlayback: vi.fn(),
		claimDemoPlayback: vi.fn(),
		finishDemoPlayback: vi.fn(),
		failDemoPlayback: vi.fn(),
		claimMixPlayback: vi.fn(),
		finishMixPlayback: vi.fn(),
		failMixPlayback: vi.fn(),
		claimRecordingPlayback: vi.fn(),
		finishRecordingPlayback: vi.fn(),
		failRecordingPlayback: vi.fn(),
		replaceRecordingSource: vi.fn(),
	},
	blob: {
		readBlob: vi.fn(),
		putBlob: vi.fn(),
		deleteBlobs: vi.fn(),
		playbackPathname: vi.fn((p: string) => p.replace(/\.[a-z0-9]+$/i, "") + ".play-x.m4a"),
	},
	mix: { ensureOriginalMix: vi.fn() },
	notes: { ensureSongNotes: vi.fn() },
	fs: { removed: [] as string[], written: new Map<string, Buffer>() },
	ffmpegPath: "/opt/ffmpeg" as string | null,
}));

vi.mock("ffmpeg-static", () => ({
	get default() {
		return h.ffmpegPath;
	},
}));
vi.mock("node:child_process", () => ({
	execFile: (
		_file: string,
		args: string[],
		_opts: unknown,
		cb: (e: Error | null, out?: { stdout: string; stderr: string }) => void,
	) => {
		h.runs.push(args);
		const a = h.answer(args);
		if (a instanceof Error) cb(a);
		else cb(null, { stdout: "", stderr: a?.stderr ?? "" });
	},
}));
vi.mock("node:fs", () => ({
	createWriteStream: () => new Writable({ write: (_c, _e, done) => done() }),
}));
vi.mock("node:fs/promises", () => ({
	mkdtemp: vi.fn(async (prefix: string) => `${prefix}abc`),
	readFile: vi.fn(
		async (file: string) => h.fs.written.get(file) ?? Buffer.from(`bytes of ${file}`),
	),
	rm: vi.fn(async (dir: string) => {
		h.fs.removed.push(dir);
	}),
}));
vi.mock("node:stream/promises", () => ({ pipeline: vi.fn(async () => {}) }));
vi.mock("#lib/server/data.js", () => h.data);
vi.mock("#lib/server/blob.js", () => h.blob);
vi.mock("#lib/server/mix.js", () => h.mix);
vi.mock("#lib/server/notes.js", () => h.notes);

const { renderStems, renderDemos, renderRecordings } = await import("./transcode");

const PUBLIC = "https://store.public.blob.vercel-storage.com";
const PRIVATE = "https://store.private.blob.vercel-storage.com";
const stemClaim = (over: Record<string, unknown> = {}) => ({
	url: `${PUBLIC}/accounts/a/songs/s/stem1.wav`,
	pathname: "accounts/a/songs/s/stem1.wav",
	channels: 2,
	playbackUrl: null,
	songId: "song-1",
	...over,
});
const takeClaim = (over: Record<string, unknown> = {}) => ({
	url: `${PRIVATE}/accounts/a/recordings/r1/take.webm`,
	pathname: "accounts/a/recordings/r1/take.webm",
	playbackUrl: null,
	contentType: "audio/webm",
	codec: "pcm",
	trimSilence: false,
	...over,
});
/** The argv of the ffmpeg run that wrote `output` (its last argument). */
const runFor = (output: RegExp) => h.runs.find((r) => output.test(r[r.length - 1]));
const silenceLog = [
	"  Duration: 00:00:10.00, start: 0.000000, bitrate: 1536 kb/s",
	"[silencedetect] silence_start: 0",
	"[silencedetect] silence_end: 1.5 | silence_duration: 1.5",
	"[silencedetect] silence_start: 8.2",
	"size=N/A time=00:00:10.00 bitrate=N/A speed= 500x",
].join("\n");

/** A fresh body per fetch: a Response's stream can be read once. */
const fetched = () => new Response(new Blob(["audio"]), { status: 200, statusText: "OK" });
beforeEach(() => {
	vi.resetAllMocks();
	h.runs.length = 0;
	h.fs.removed.length = 0;
	h.fs.written.clear();
	h.ffmpegPath = "/opt/ffmpeg";
	h.answer.mockReturnValue({ stderr: "" });
	h.blob.playbackPathname.mockImplementation(
		(p: string) => p.replace(/\.[a-z0-9]+$/i, "") + ".play-x.m4a",
	);
	h.blob.readBlob.mockImplementation(async () => fetched());
	h.blob.putBlob.mockImplementation(
		async (pathname: string, _b: Buffer, _t: string, access = "public") => ({
			url: `${access === "private" ? PRIVATE : PUBLIC}/${pathname}`,
		}),
	);
});

describe("renderStems", () => {
	it("makes a 192k AAC rendition of a stereo stem at 48 kHz with the metadata stripped, then the song's mix and notes", async () => {
		h.data.claimPlayback.mockResolvedValue(stemClaim());
		await renderStems(["stem-1"]);
		expect(h.data.claimPlayback).toHaveBeenCalledWith("stem-1");
		expect(h.runs).toHaveLength(1);
		const args = h.runs[0];
		expect(args.slice(0, 5)).toEqual(["-hide_banner", "-loglevel", "error", "-y", "-i"]);
		expect(args[5]).toMatch(/\/stem-abc\/source$/);
		expect(args.slice(6)).toEqual([
			"-vn",
			"-map_metadata",
			"-1",
			"-ar",
			"48000",
			"-c:a",
			"aac",
			"-b:a",
			"192k",
			"-movflags",
			"+faststart",
			expect.stringMatching(/\/playback\.m4a$/),
		]);
		expect(h.blob.putBlob).toHaveBeenCalledWith(
			"accounts/a/songs/s/stem1.play-x.m4a",
			expect.any(Buffer),
			"audio/mp4",
			"public",
		);
		expect(h.data.finishPlayback).toHaveBeenCalledWith("stem-1", {
			url: `${PUBLIC}/accounts/a/songs/s/stem1.play-x.m4a`,
			pathname: "accounts/a/songs/s/stem1.play-x.m4a",
			bytes: expect.any(Number),
		});
		expect(h.blob.deleteBlobs).not.toHaveBeenCalled();
		expect(h.mix.ensureOriginalMix).toHaveBeenCalledWith("song-1");
		expect(h.notes.ensureSongNotes).toHaveBeenCalledWith("song-1");
		expect(h.fs.removed).toEqual([expect.stringMatching(/stem-abc$/)]);
	});
	it("downmixes a mono stem to one channel at 128k, keeps the store private, and retires the old rendition", async () => {
		h.data.claimPlayback.mockResolvedValue(
			stemClaim({
				channels: 1,
				url: `${PRIVATE}/accounts/a/songs/s/stem1.wav`,
				playbackUrl: `${PRIVATE}/accounts/a/songs/s/stem1.play-old.m4a`,
			}),
		);
		await renderStems(["stem-1"]);
		const args = h.runs[0];
		expect(args).toContain("-ac");
		expect(args[args.indexOf("-ac") + 1]).toBe("1");
		expect(args[args.indexOf("-b:a") + 1]).toBe("128k");
		expect(h.blob.putBlob).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(Buffer),
			"audio/mp4",
			"private",
		);
		expect(h.blob.deleteBlobs).toHaveBeenCalledWith([
			`${PRIVATE}/accounts/a/songs/s/stem1.play-old.m4a`,
		]);
	});
	it("renders stems one at a time and refreshes each song once", async () => {
		h.data.claimPlayback
			.mockResolvedValueOnce(stemClaim({ songId: "song-1" }))
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(
				stemClaim({ songId: "song-1", pathname: "accounts/a/songs/s/stem3.wav" }),
			)
			.mockResolvedValueOnce(stemClaim({ songId: "song-2" }));
		await renderStems(["a", "b", "c", "d"]);
		expect(h.runs).toHaveLength(3);
		expect(h.mix.ensureOriginalMix.mock.calls).toEqual([["song-1"], ["song-2"]]);
		expect(h.notes.ensureSongNotes.mock.calls).toEqual([["song-1"], ["song-2"]]);
	});
	it("does nothing for a stem another job holds", async () => {
		h.data.claimPlayback.mockResolvedValue(null);
		await renderStems(["stem-1"]);
		expect(h.runs).toEqual([]);
		expect(h.blob.readBlob).not.toHaveBeenCalled();
		expect(h.mix.ensureOriginalMix).not.toHaveBeenCalled();
	});
	it("fails the row and rethrows when ffmpeg exits with an error, removing the temporary directory", async () => {
		h.data.claimPlayback.mockResolvedValue(stemClaim());
		h.answer.mockReturnValue(
			Object.assign(new Error("ffmpeg exited 1"), { stderr: "Invalid data" }),
		);
		await expect(renderStems(["stem-1"])).rejects.toThrow("ffmpeg exited 1");
		expect(h.data.failPlayback).toHaveBeenCalledWith("stem-1");
		expect(h.data.finishPlayback).not.toHaveBeenCalled();
		expect(h.blob.putBlob).not.toHaveBeenCalled();
		expect(h.fs.removed).toHaveLength(1);
	});
	it("fails the row when the source cannot be fetched", async () => {
		h.data.claimPlayback.mockResolvedValue(stemClaim());
		h.blob.readBlob.mockResolvedValue(new Response(null, { status: 404, statusText: "Not Found" }));
		await expect(renderStems(["stem-1"])).rejects.toThrow("404 Not Found fetching");
		expect(h.data.failPlayback).toHaveBeenCalledWith("stem-1");
		expect(h.runs).toEqual([]);
	});
	it("fails the row and throws when there is no ffmpeg binary", async () => {
		h.ffmpegPath = null;
		h.data.claimPlayback.mockResolvedValue(stemClaim());
		await expect(renderStems(["stem-1"])).rejects.toThrow("ffmpeg binary is not available");
		expect(h.data.failPlayback).toHaveBeenCalledWith("stem-1");
		expect(h.blob.readBlob).not.toHaveBeenCalled();
	});
});

describe("renderDemos", () => {
	it("makes a 192k MP3 at 44.1 kHz, mono or stereo, under a .play-<stamp>.mp3 name", async () => {
		h.data.claimDemoPlayback.mockResolvedValue({
			url: `${PUBLIC}/accounts/a/songs/s/demos/d1.m4a`,
			pathname: "accounts/a/songs/s/demos/d1.m4a",
			playbackUrl: null,
		});
		await renderDemos(["demo-1"]);
		expect(h.runs).toHaveLength(1);
		const args = h.runs[0];
		expect(args.slice(6)).toEqual([
			"-vn",
			"-map_metadata",
			"-1",
			"-af",
			"aformat=channel_layouts=mono|stereo",
			"-ar",
			"44100",
			"-c:a",
			"libmp3lame",
			"-b:a",
			"192k",
			"-id3v2_version",
			"3",
			expect.stringMatching(/\/demo\.mp3$/),
		]);
		expect(h.blob.putBlob).toHaveBeenCalledWith(
			expect.stringMatching(/^accounts\/a\/songs\/s\/demos\/d1\.play-[a-z0-9]+\.mp3$/),
			expect.any(Buffer),
			"audio/mpeg",
			"public",
		);
		expect(h.data.finishDemoPlayback).toHaveBeenCalledWith("demo-1", {
			url: expect.stringMatching(/d1\.play-[a-z0-9]+\.mp3$/),
			pathname: expect.stringMatching(/d1\.play-[a-z0-9]+\.mp3$/),
			bytes: expect.any(Number),
		});
		// A demo is never probed for raw PCM or silence: the one run is the MP3.
		expect(h.data.replaceRecordingSource).not.toHaveBeenCalled();
	});
	it("fails the demo and rethrows on an ffmpeg error", async () => {
		h.data.claimDemoPlayback.mockResolvedValue({
			url: `${PUBLIC}/x/d1.caf`,
			pathname: "x/d1.caf",
			playbackUrl: null,
		});
		h.answer.mockReturnValue(new Error("boom"));
		await expect(renderDemos(["demo-1"])).rejects.toThrow("boom");
		expect(h.data.failDemoPlayback).toHaveBeenCalledWith("demo-1");
	});
});

describe("renderRecordings", () => {
	/** ffmpeg's probe (`-i file` with no output) exits 1 with the stream line in stderr. */
	const probeSays = (codecLine: string, silence = "") =>
		h.answer.mockImplementation((args) => {
			const last = args[args.length - 1];
			if (last === "-") return { stderr: silence }; // the silencedetect pass
			if (args.length === 3) return Object.assign(new Error("exit 1"), { stderr: codecLine }); // the probe
			return { stderr: "" };
		});
	it("probes a take, and a compressed one with no trim goes straight to the MP3", async () => {
		h.data.claimRecordingPlayback.mockResolvedValue(takeClaim({ codec: "opus" }));
		probeSays("  Stream #0:0: Audio: opus, 48000 Hz, stereo");
		await renderRecordings(["take-1"]);
		expect(h.runs.map((r) => r[r.length - 1])).toEqual([
			expect.stringMatching(/\/source$/), // the probe
			expect.stringMatching(/\/demo\.mp3$/),
		]);
		expect(h.data.replaceRecordingSource).not.toHaveBeenCalled();
		expect(h.data.finishRecordingPlayback).toHaveBeenCalledWith("take-1", {
			url: expect.stringMatching(/^https:\/\/store\.private\..*take\.play-[a-z0-9]+\.mp3$/),
			pathname: expect.stringMatching(/^accounts\/a\/recordings\/r1\/take\.play-[a-z0-9]+\.mp3$/),
			bytes: expect.any(Number),
		});
	});
	it("turns Chrome's raw PCM take into FLAC, replaces the source with it and makes the MP3 from the FLAC", async () => {
		h.data.claimRecordingPlayback.mockResolvedValue(takeClaim());
		probeSays("  Stream #0:0: Audio: pcm_f32le, 48000 Hz, stereo, flt, 3072 kb/s");
		await renderRecordings(["take-1"]);
		const flac = runFor(/\/source\.flac$/)!;
		expect(flac.slice(6)).toEqual([
			"-vn",
			"-map_metadata",
			"-1",
			"-c:a",
			"flac",
			"-compression_level",
			"5",
			expect.stringMatching(/\/source\.flac$/),
		]);
		expect(h.blob.putBlob).toHaveBeenCalledWith(
			"accounts/a/recordings/r1/take.flac",
			expect.any(Buffer),
			"audio/flac",
			"private",
		);
		expect(h.data.replaceRecordingSource).toHaveBeenCalledWith("take-1", {
			url: `${PRIVATE}/accounts/a/recordings/r1/take.flac`,
			pathname: "accounts/a/recordings/r1/take.flac",
			filename: "take.flac",
			contentType: "audio/flac",
			sizeBytes: expect.any(Number),
			codec: "flac",
		});
		// The WebM original goes; the MP3 is made from the FLAC.
		expect(h.blob.deleteBlobs).toHaveBeenCalledWith([takeClaim().url]);
		const mp3 = runFor(/\/demo\.mp3$/)!;
		expect(mp3[mp3.indexOf("-i") + 1]).toMatch(/\/source\.flac$/);
	});
	it("cuts the silence off a raw PCM take while making the FLAC, and reports the new length", async () => {
		h.data.claimRecordingPlayback.mockResolvedValue(takeClaim({ trimSilence: true }));
		probeSays("  Stream #0:0: Audio: pcm_s24le, 48000 Hz, stereo", silenceLog);
		await renderRecordings(["take-1"]);
		const detect = h.runs.find((r) => r[r.length - 1] === "-")!;
		expect(detect).toEqual([
			"-hide_banner",
			"-i",
			expect.stringMatching(/\/source$/),
			"-vn",
			"-af",
			expect.stringMatching(/^silencedetect=noise=-?\d+dB:d=[\d.]+$/),
			"-f",
			"null",
			"-",
		]);
		const flac = runFor(/\/source\.flac$/)!;
		const ss = flac.indexOf("-ss");
		expect(ss).toBeGreaterThan(flac.indexOf("-i")); // after the input: cut to the sample
		expect(flac[ss + 2]).toBe("-to");
		const start = Number(flac[ss + 1]);
		const end = Number(flac[ss + 3]);
		expect(start).toBeGreaterThanOrEqual(0);
		expect(start).toBeLessThan(1.5);
		expect(end).toBeGreaterThan(8.2);
		expect(end).toBeLessThanOrEqual(10);
		expect(h.data.replaceRecordingSource).toHaveBeenCalledWith(
			"take-1",
			expect.objectContaining({ codec: "flac", durationSeconds: expect.closeTo(end - start, 3) }),
		);
	});
	it("trims a lossless (ALAC) take by re-encoding it and a compressed one by stream copy, under a -t<stamp> name", async () => {
		h.data.claimRecordingPlayback.mockResolvedValue(
			takeClaim({
				trimSilence: true,
				codec: "alac",
				contentType: "audio/mp4",
				url: `${PRIVATE}/accounts/a/recordings/r1/take.m4a`,
				pathname: "accounts/a/recordings/r1/take.m4a",
			}),
		);
		probeSays("  Stream #0:0: Audio: alac, 48000 Hz, stereo", silenceLog);
		await renderRecordings(["take-1"]);
		const trimmed = runFor(/\/trimmed\.m4a$/)!;
		expect(trimmed[trimmed.indexOf("-c:a") + 1]).toBe("alac");
		expect(trimmed).toContain("-ss");
		expect(h.blob.putBlob).toHaveBeenCalledWith(
			expect.stringMatching(/^accounts\/a\/recordings\/r1\/take-t[a-z0-9]+\.m4a$/),
			expect.any(Buffer),
			"audio/mp4",
			"private",
		);
		expect(h.data.replaceRecordingSource).toHaveBeenCalledWith(
			"take-1",
			expect.objectContaining({
				codec: "alac",
				contentType: "audio/mp4",
				filename: expect.stringMatching(/^take-t[a-z0-9]+\.m4a$/),
				durationSeconds: expect.any(Number),
			}),
		);
		expect(h.blob.deleteBlobs).toHaveBeenCalledWith([
			`${PRIVATE}/accounts/a/recordings/r1/take.m4a`,
		]);

		vi.clearAllMocks();
		h.runs.length = 0;
		h.data.claimRecordingPlayback.mockResolvedValue(
			takeClaim({ trimSilence: true, codec: "opus" }),
		);
		probeSays("  Stream #0:0: Audio: opus, 48000 Hz, stereo", silenceLog);
		await renderRecordings(["take-2"]);
		const copied = runFor(/\/trimmed\.webm$/)!;
		expect(copied[copied.indexOf("-c:a") + 1]).toBe("copy");
	});
	it("leaves a take as recorded when the silence pass finds nothing to cut", async () => {
		h.data.claimRecordingPlayback.mockResolvedValue(
			takeClaim({ trimSilence: true, codec: "opus" }),
		);
		probeSays("  Stream #0:0: Audio: opus", "  Duration: 00:00:10.00\nsize=N/A time=00:00:10.00");
		await renderRecordings(["take-1"]);
		expect(runFor(/\/trimmed\./)).toBeUndefined();
		expect(h.data.replaceRecordingSource).not.toHaveBeenCalled();
		expect(h.data.finishRecordingPlayback).toHaveBeenCalledTimes(1);
	});
	it("fails the take and rethrows when the MP3 step breaks, after the FLAC was already swapped in", async () => {
		h.data.claimRecordingPlayback.mockResolvedValue(takeClaim());
		h.answer.mockImplementation((args) => {
			const last = args[args.length - 1];
			if (args.length === 3)
				return Object.assign(new Error("exit 1"), { stderr: "Audio: pcm_s16le" });
			if (last.endsWith("demo.mp3")) return new Error("mp3 failed");
			return { stderr: "" };
		});
		await expect(renderRecordings(["take-1"])).rejects.toThrow("mp3 failed");
		expect(h.data.replaceRecordingSource).toHaveBeenCalledTimes(1);
		expect(h.data.failRecordingPlayback).toHaveBeenCalledWith("take-1");
		expect(h.data.finishRecordingPlayback).not.toHaveBeenCalled();
		expect(h.fs.removed).toHaveLength(1);
	});
});
