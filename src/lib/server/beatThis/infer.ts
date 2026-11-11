import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { modelFile, runOrtChild } from "#lib/server/ort/child.js";
import { beatThisChunkOf } from "#lib/utils/beatThisChunkOf.js";
import { beatThisChunks } from "#lib/utils/beatThisChunks.js";
import { beatThisStitch } from "#lib/utils/beatThisStitch.js";
import model from "./model.json";

/**
 * Beat This (CPJKU, MIT; the small0 checkpoint exported at 1500 frames by
 * stem-bench Study 42) run on a log-mel spectrogram in a child process
 * (`ort/child.ts` says why and how the model reaches it). The export is
 * static: every window is exactly 1500 frames (30 s), which is the length
 * its attention was traced at; an earlier export traced short read 5-second
 * windows as a different, worse tracker (FINDINGS, 2026-11-11).
 */
const CHUNK = 1500;
const MELS = 128;

/** The child, after the preamble: args = model, windows, output, count. Writes per window [1500] beat then [1500] downbeat, float32. */
const CHILD_SCRIPT = `
const [modelPath, windowsPath, outPath, countArg] = args;
const CHUNK = ${CHUNK}, MELS = ${MELS};
const count = Number(countArg);
const raw = readFileSync(windowsPath);
const windows = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
const session = await ort.InferenceSession.create(readFileSync(modelPath), { executionProviders: ["wasm"] });
const out = new Float32Array(count * 2 * CHUNK);
for (let w = 0; w < count; w++) {
	const data = windows.slice(w * CHUNK * MELS, (w + 1) * CHUNK * MELS);
	const result = await session.run({ spectrogram: new ort.Tensor("float32", data, [1, CHUNK, MELS]) });
	out.set(result.beat.data, w * 2 * CHUNK);
	out.set(result.downbeat.data, w * 2 * CHUNK + CHUNK);
}
await session.release?.();
writeFileSync(outPath, out);
process.exit(0);
`;

/**
 * The tracker's frame logits for a log-mel spectrogram `[frames][128]`
 * (beatThisLogMel), 50 frames a second: the piece in 1500-frame windows
 * with a 6-frame border, stitched keeping the earlier window where two
 * overlap, exactly as the package does. `dir` is a scratch directory the
 * caller owns.
 */
export async function beatThisLogits(
	spect: Float32Array,
	frames: number,
	dir: string,
): Promise<{ beat: Float32Array; downbeat: Float32Array }> {
	const starts = beatThisChunks(frames);
	const windows = new Float32Array(starts.length * CHUNK * MELS);
	starts.forEach((start, w) =>
		windows.set(beatThisChunkOf(spect, frames, MELS, start), w * CHUNK * MELS),
	);
	const windowsPath = join(dir, "beat-windows.f32");
	const outPath = join(dir, "beat-logits.f32");
	await writeFile(windowsPath, new Uint8Array(windows.buffer));
	await runOrtChild("beat-this", CHILD_SCRIPT, dir, [
		await modelFile(dir, "beat-this-small0.onnx", model),
		windowsPath,
		outPath,
		String(starts.length),
	]);
	const raw = await readFile(outPath);
	const out = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
	const rows = (offset: number) =>
		starts.map((_, w) => out.slice(w * 2 * CHUNK + offset, w * 2 * CHUNK + offset + CHUNK));
	return {
		beat: beatThisStitch(rows(0), starts, frames),
		downbeat: beatThisStitch(rows(CHUNK), starts, frames),
	};
}
