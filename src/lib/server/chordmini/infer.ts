import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { modelFile, runOrtChild } from "#lib/server/ort/child.js";
import model from "./model.json";

/**
 * ChordMini's network (chordnet.onnx, MIT) run on CQT features in a child
 * process (`ort/child.ts` says why and how the model and the runtime's
 * wasm backend reach it).
 */
const CLASSES = 170;

/** The child, after the preamble: args = model, features, output, frames. Writes [frames][170] float32. */
const CHILD_SCRIPT = `
const [modelPath, featuresPath, outPath, framesArg] = args;
const SEQ = 108, GROUP = 16, BINS = 144, CLASSES = ${CLASSES};
const frames = Number(framesArg);
const raw = readFileSync(featuresPath);
const features = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
const session = await ort.InferenceSession.create(readFileSync(modelPath), { executionProviders: ["wasm"] });
const windows = Math.ceil(frames / SEQ);
const out = new Float32Array(windows * SEQ * CLASSES);
for (let w = 0; w < windows; w += GROUP) {
	const real = Math.min(GROUP, windows - w);
	const data = new Float32Array(GROUP * SEQ * BINS);
	const from = w * SEQ * BINS;
	data.set(features.subarray(from, Math.min(features.length, from + real * SEQ * BINS)));
	const result = await session.run({ features: new ort.Tensor("float32", data, [GROUP, SEQ, BINS]) });
	const logits = result.logits.data;
	out.set(logits.subarray(0, real * SEQ * CLASSES), w * SEQ * CLASSES);
}
await session.release?.();
writeFileSync(outPath, out.subarray(0, frames * CLASSES));
process.exit(0);
`;

/**
 * ChordMini's logits `[frames][170]` for CQT features `[frames][144]`
 * (chordminiFeatures), in windows of 108 frames run 16 at a time, the
 * padding zeros, exactly as the bench's Python runner. `dir` is a scratch
 * directory the caller owns (the model and the two arrays are written there).
 */
export async function chordminiLogits(
	features: Float32Array,
	frames: number,
	dir: string,
): Promise<Float32Array> {
	const modelPath = await modelFile(dir, "chordnet.onnx", model);
	const featuresPath = join(dir, "features.f32");
	const outPath = join(dir, "logits.f32");
	await writeFile(
		featuresPath,
		new Uint8Array(features.buffer, features.byteOffset, frames * 144 * 4),
	);
	await runOrtChild("chordmini", CHILD_SCRIPT, dir, [
		modelPath,
		featuresPath,
		outPath,
		String(frames),
	]);
	const raw = await readFile(outPath);
	const logits = new Float32Array(frames * CLASSES);
	logits.set(new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4));
	return logits;
}
