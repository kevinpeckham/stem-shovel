import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import wasm from "./wasm.json";

/**
 * What the ONNX models in the jobs function share (ChordMini's chords,
 * Beat This's beats): each runs in a child process, because ONNX Runtime's
 * WebAssembly backend on one thread is seconds of solid compute per song,
 * which in the server's own event loop would stall every other request.
 * A model ships inside its module as base64 JSON (bundled by Vite: the
 * adapter never packs a file read from disk) and is written into the job's
 * temp dir, checked against its SHA-256, once per dir; so is the runtime's
 * wasm backend (`wasm.json`: the factory module and the binary, which
 * Vercel's tracer does not pack beside `ort.node.min.mjs`). The child gets
 * onnxruntime-web by absolute URL resolved here and the backend from the dir.
 */
const STDERR_TAIL = 2048;

export interface PackedModel {
	sha256: string;
	bytes: number;
	base64: string;
}

/** The model as `name` in `dir`, decoded and verified on first use. */
export async function modelFile(dir: string, name: string, model: PackedModel): Promise<string> {
	const path = join(dir, name);
	if (existsSync(path)) return path;
	const bytes = Buffer.from(model.base64, "base64");
	const sha256 = createHash("sha256").update(bytes).digest("hex");
	if (sha256 !== model.sha256 || bytes.byteLength !== model.bytes)
		throw new Error(`${name} does not match its hash (${sha256}, ${bytes.byteLength} bytes)`);
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

/** What every child script starts with: argv = ort URL, wasm dir URL, then the script's own; `ort` ready on one thread. */
const ORT_CHILD_PREAMBLE = `
const [ortUrl, wasmPaths, ...args] = process.argv.slice(1);
const imported = await import(ortUrl);
const ort = imported.InferenceSession ? imported : imported.default;
const { readFileSync, writeFileSync } = await import("node:fs");
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = wasmPaths;
`;

/**
 * Runs `script` (after the preamble) in a child with `args`, the wasm
 * backend from `dir`; rejects with the stderr tail on a failure, `label`
 * naming the model in the message.
 */
export async function runOrtChild(
	label: string,
	script: string,
	dir: string,
	args: string[],
): Promise<void> {
	const argv = [import.meta.resolve("onnxruntime-web"), await wasmDir(dir), ...args];
	return new Promise((resolve, reject) => {
		execFile(
			process.execPath,
			["--input-type=module", "-e", ORT_CHILD_PREAMBLE + script, ...argv],
			{ maxBuffer: 16 * 1024 * 1024 },
			(error, _stdout, stderr) => {
				if (!error) return resolve();
				const tail = (stderr || error.message).slice(-STDERR_TAIL);
				reject(new Error(`${label} child failed (${error.code ?? error.signal}): ${tail}`));
			},
		);
	});
}
