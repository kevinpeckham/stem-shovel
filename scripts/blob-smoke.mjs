/**
 * End-to-end smoke test for the upload flow, driven exactly as the browser
 * does it, against a running dev server:
 *
 *   form action  POST /projects?/create            → project
 *   form action  POST /projects/<p>?/createSong    → song
 *   per file:    POST /api/stems (reserve)  →  upload() to Blob  →  POST /api/stems/<id>/ready
 *
 * Usage: bun run stems && bun run smoke:blob [kick,hats,bass,keys]
 */
import { upload } from "@vercel/blob/client";
import { readFile } from "node:fs/promises";

const base = process.env.SMOKE_BASE ?? "http://localhost:5173";
const names = (process.argv[2] ?? "kick,hats,bass,keys").split(",");
const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");

async function action(path, name, fields) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	const res = await fetch(`${base}${path}?/${name}`, {
		method: "POST",
		headers: { origin: base, "x-sveltekit-action": "true" },
		body,
	});
	const json = await res.json();
	if (json.type !== "redirect") throw new Error(`${name}: ${JSON.stringify(json).slice(0, 200)}`);
	return json.location;
}

async function post(path, payload) {
	const res = await fetch(`${base}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});
	if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
	return res.json();
}

/** Minimal RIFF/WAVE reader for the 16-bit PCM files make-test-stems.mjs writes. */
function analyzeWav(buf, bins = 1024) {
	let pos = 12;
	let channels = 1;
	let sampleRate = 44100;
	let bits = 16;
	let data = null;
	while (pos + 8 <= buf.length) {
		const id = buf.toString("ascii", pos, pos + 4);
		const size = buf.readUInt32LE(pos + 4);
		if (id === "fmt ") {
			channels = buf.readUInt16LE(pos + 10);
			sampleRate = buf.readUInt32LE(pos + 12);
			bits = buf.readUInt16LE(pos + 22);
		} else if (id === "data") data = buf.subarray(pos + 8, pos + 8 + size);
		pos += 8 + size + (size % 2);
	}
	if (!data || bits !== 16) throw new Error("expected 16-bit PCM WAV");
	const frames = data.length / (2 * channels);
	const peaks = Array.from({ length: bins }, () => 0);
	for (let i = 0; i < frames * channels; i++) {
		const v = Math.abs(data.readInt16LE(i * 2)) / 32768;
		const bin = Math.min(bins - 1, Math.floor(Math.floor(i / channels) / (frames / bins)));
		if (v > peaks[bin]) peaks[bin] = v;
	}
	return { durationSeconds: frames / sampleRate, channels, peaks };
}

const projectUrl = await action("/projects", "create", { name: `Smoke ${stamp}` });
const songUrl = await action(projectUrl, "createSong", { title: "Test loop in D" });
const html = await (await fetch(`${base}${songUrl}`)).text();
const songId = html.match(/data-song-id="([^"]+)"/)?.[1];
if (!songId) throw new Error("song id not found on the song page");
console.log(`project ${projectUrl} · song ${songUrl} (${songId})`);

for (const n of names) {
	const filename = `${n}.wav`;
	const bytes = await readFile(`static/stems/${filename}`);
	const t0 = Date.now();
	const { stemId, pathname } = await post("/api/stems", {
		songId,
		filename,
		contentType: "audio/wav",
		sizeBytes: bytes.length,
	});
	const blob = await upload(pathname, bytes, {
		access: "public",
		handleUploadUrl: `${base}/api/upload`,
		contentType: "audio/wav",
		multipart: true,
	});
	const { durationSeconds, channels, peaks } = analyzeWav(bytes);
	await post(`/api/stems/${stemId}/ready`, { url: blob.url, durationSeconds, channels, peaks });
	console.log(
		`  ${filename} → ${pathname} (${durationSeconds.toFixed(1)}s, ${channels}ch, ${Date.now() - t0} ms)`,
	);
}

const page = await (await fetch(`${base}${songUrl}`)).text();
const ready = (page.match(/\d+ stems/) ?? ["?"])[0];
console.log(`song page reports: ${ready} · open ${base}${songUrl}`);
