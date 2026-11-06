import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import model from "./model.json";
import wasm from "./wasm.json";

/**
 * ChordMini's network (chordnet.onnx, MIT) run on CQT features in a child
 * process, like the Basic Pitch transcriber in notes.ts: ONNX Runtime's
 * WebAssembly backend on one thread is seconds of solid compute per song,
 * which in the server's own event loop would stall every other request.
 * The model ships inside this module as base64 (`model.json`, bundled by
 * Vite: the adapter never packs a file read from disk) and is written into
 * the job's temp dir, checked against its SHA-256, once per dir, and so is
 * the runtime's wasm backend (`wasm.json`: the factory module and the
 * binary, which Vercel's tracer does not pack beside `ort.node.min.mjs`);
 * the child gets onnxruntime-web by absolute URL resolved here and the
 * backend from the dir.
 */
const CLASSES = 170;
const STDERR_TAIL = 2048;

/** The model file in `dir`, decoded and verified on first use. */
async function modelFile(dir: string): Promise<string> {
	const path = join(dir, "chordnet.onnx");
	if (existsSync(path)) return path;
	const bytes = Buffer.from(model.base64, "base64");
	const sha256 = createHash("sha256").update(bytes).digest("hex");
	if (sha256 !== model.sha256 || bytes.byteLength !== model.bytes)
		throw new Error(`chordnet.onnx does not match its hash (${sha256}, ${bytes.byteLength} bytes)`);
	await writeFile(path, bytes);
	return path;
}

/** The wasm backend's two files in `dir`, written on first use; the dir as the URL prefix ORT loads them from. */
async function wasmDir(dir: string): Promise<string> {
	const binary = join(dir, "ort-wasm-simd-threaded.wasm");
	if (!existsSync(binary)) {
		const bytes = Buffer.from(wasm.wasm.base64, "base64");
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		if (sha256 !== wasm.wasm.sha256 || bytes.byteLength !== wasm.wasm.bytes)
			throw new Error(`ort wasm does not match its hash (${sha256}, ${bytes.byteLength} bytes)`);
		await writeFile(join(dir, "ort-wasm-simd-threaded.mjs"), wasm.mjs);
		await writeFile(binary, bytes);
	}
	return pathToFileURL(`${dir}/`).href;
}

/** The child: argv = ort URL, wasm dir URL, model, features, output, frames. Writes [frames][170] float32. */
const CHILD_SCRIPT = `
const [ortUrl, wasmPaths, modelPath, featuresPath, outPath, framesArg] = process.argv.slice(1);
const imported = await import(ortUrl);
const ort = imported.InferenceSession ? imported : imported.default;
const { readFileSync, writeFileSync } = await import("node:fs");
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = wasmPaths;
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

/** Runs CHILD_SCRIPT with `args`, rejecting with the stderr tail on a failure. */
function runChild(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile(
			process.execPath,
			["--input-type=module", "-e", CHILD_SCRIPT, ...args],
			{ maxBuffer: 16 * 1024 * 1024 },
			(error, _stdout, stderr) => {
				if (!error) return resolve();
				const tail = (stderr || error.message).slice(-STDERR_TAIL);
				reject(new Error(`chordmini child failed (${error.code ?? error.signal}): ${tail}`));
			},
		);
	});
}

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
	const modelPath = await modelFile(dir);
	const featuresPath = join(dir, "features.f32");
	const outPath = join(dir, "logits.f32");
	await writeFile(
		featuresPath,
		new Uint8Array(features.buffer, features.byteOffset, frames * 144 * 4),
	);
	await runChild([
		import.meta.resolve("onnxruntime-web"),
		await wasmDir(dir),
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
