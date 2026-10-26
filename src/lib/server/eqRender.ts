import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import ffmpegPath from "ffmpeg-static";

/** The ffmpeg arguments: the file in, the EQ graph applied, a 192k MP3 out on stdout. */
function eqRenderArgs(input: string, graph: string): string[] {
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-i",
		input,
		"-vn",
		"-af",
		graph,
		"-c:a",
		"libmp3lame",
		"-b:a",
		"192k",
		"-f",
		"mp3",
		"pipe:1",
	];
}

/**
 * A recording with the playback EQ applied (api/sessions/[id]/eq.mp3), as
 * an MP3 streamed while ffmpeg encodes it. The source goes to a temp file
 * first (ffmpeg seeks in an M4A, which a pipe cannot), removed when ffmpeg
 * exits. Rejects when ffmpeg fails before its first byte, so the endpoint
 * can still answer with an error status; a failure after that errors the
 * stream. Canceling the stream kills ffmpeg.
 */
export async function renderWithEq(
	input: Response,
	graph: string,
): Promise<ReadableStream<Uint8Array>> {
	if (!ffmpegPath) throw new Error("No ffmpeg binary for this platform");
	if (!input.body) throw new Error("The recording's file has no body");
	const dir = await mkdtemp(join(tmpdir(), "eq-"));
	const cleanup = () => rm(dir, { recursive: true, force: true }).catch(() => {});
	const source = join(dir, "source");
	try {
		await pipeline(
			Readable.fromWeb(input.body as unknown as NodeReadableStream<Uint8Array>),
			createWriteStream(source),
		);
	} catch (e) {
		await cleanup();
		throw e;
	}

	const child = spawn(ffmpegPath, eqRenderArgs(source, graph), {
		stdio: ["ignore", "pipe", "pipe"],
	});
	let stderr = "";
	child.stderr.on("data", (c: Buffer) => {
		stderr = (stderr + c.toString()).slice(-2000);
	});
	let spawnError: Error | null = null;
	child.on("error", (e) => {
		spawnError = e;
	});
	// 'close' follows 'error' too, so the temp folder goes either way.
	const exited = new Promise<number | null>((resolve) =>
		child.on("close", (code) => {
			void cleanup();
			resolve(code);
		}),
	);
	const failure = (code: number | null) =>
		spawnError ?? new Error(`ffmpeg exited with ${code}: ${stderr.trim()}`);

	const first = await new Promise<Buffer | null>((resolve) => {
		child.stdout.once("data", (c: Buffer) => {
			child.stdout.pause();
			resolve(c);
		});
		void exited.then(() => resolve(null));
	});
	if (!first) throw failure(await exited);

	let done = false;
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(first);
			child.stdout.on("data", (c: Buffer) => {
				if (done) return;
				controller.enqueue(c);
				if ((controller.desiredSize ?? 1) <= 0) child.stdout.pause();
			});
			void exited.then((code) => {
				if (done) return;
				done = true;
				if (code === 0) controller.close();
				else controller.error(failure(code));
			});
		},
		pull() {
			child.stdout.resume();
		},
		cancel() {
			done = true;
			child.kill("SIGKILL");
		},
	});
}
