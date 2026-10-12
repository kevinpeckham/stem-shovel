/**
 * End-to-end smoke test for the upload flow, driven exactly as the browser
 * does it, against a running dev server:
 *
 *   remote form  createProject                     → project
 *   remote form  createSong                        → song
 *   per file:    POST /api/stems (reserve)  →  upload() to Blob  →  POST /api/stems/<id>/ready
 *
 * Usage: bun run stems && bun run smoke:blob [kick,hats,bass,keys]
 *
 * Runs as the Screenshot Bot (the `preview_token` cookie from
 * PREVIEW_AUTH_TOKEN, docs/agent-screenshots.md), in the account
 * SMOKE_ACCOUNT names (the bot's own, mmkk, by default), against
 * SMOKE_BASE (the dev server on 127.0.0.1:5173 by default: `localhost`
 * can resolve to ::1, which the server does not listen on). Delete the
 * `smoke-*` project it makes afterwards, through the app.
 */
import { upload } from "@vercel/blob/client";
import { parse as devalueParse } from "devalue";
import { readFile } from "node:fs/promises";

const base = process.env.SMOKE_BASE ?? "http://127.0.0.1:5173";
const account = process.env.SMOKE_ACCOUNT ?? "mmkk";
const token = process.env.PREVIEW_AUTH_TOKEN ?? "";
if (!token)
	throw new Error("PREVIEW_AUTH_TOKEN is not set: run through varlock (bun run smoke:blob)");

// Every request to the dev server goes as the bot: the preview cookie, and the origin the
// remote forms check. Patched into the global fetch, since the Blob client's own call to
// /api/upload (the token route) must carry them too.
const plainFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
	const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
	if (!url.startsWith(base)) return plainFetch(input, init);
	const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : {}));
	headers.set("cookie", `preview_token=${token}`);
	headers.set("origin", base);
	return plainFetch(input, { ...init, headers });
};

/** A request to the dev server that must answer, not redirect (a sign-in page means the bot is not in). */
async function fetchAsBot(url, init = {}) {
	const res = await fetch(url, { ...init, redirect: "manual" });
	if (res.status >= 300 && res.status < 400) {
		const to = res.headers.get("location") ?? "";
		throw new Error(
			`${url} redirected to ${to}: is the bot signed in (PREVIEW_AUTH_TOKEN) and a member of ${account}?`,
		);
	}
	return res;
}

/** A hidden input's value by its name, whatever order the attributes come in. */
function hiddenValue(html, name) {
	// SvelteKit 3 names a remote form's inputs `field/<form id>` ("accountId/zt7ram/createProject").
	const tag = html.match(new RegExp(`<input\\b[^>]*name="${name}(?:/[^"]*)?"[^>]*>`))?.[0];
	return tag?.match(/\bvalue="([^"]*)"/)?.[1];
}
const names = (process.argv[2] ?? "kick,hats,bass,keys").split(",");
const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");

/**
 * Submits a remote `form` function the way the browser does. The id is read
 * from the dev server's transform of the .remote.ts module (dev only, which
 * is where this script runs).
 */
async function remoteForm(file, name, fields) {
	const src = await (await fetchAsBot(`${base}/src/lib/remote/${file}`)).text();
	const id = src.match(new RegExp(`form\\('([^']+/${name})'\\)`))?.[1];
	if (!id) throw new Error(`remote form ${name} not found in ${file}`);
	const body = new FormData();
	// The fields carry the form's id in their names, as the rendered inputs do.
	for (const [k, v] of Object.entries(fields)) body.set(`${k}/${id}`, v);
	const res = await fetchAsBot(`${base}/_app/remote/${id}`, { method: "POST", body });
	const json = await res.json();
	// The payload is devalue-encoded; a handler that redirected reports it here.
	const data = json.type === "result" ? devalueParse(json.data) : json;
	if (!data?.redirect) throw new Error(`${name}: ${JSON.stringify(json).slice(0, 200)}`);
	return data.redirect;
}

async function post(path, payload) {
	const res = await fetchAsBot(`${base}${path}`, {
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

const accountId = hiddenValue(
	await (await fetchAsBot(`${base}/${account}/projects`)).text(),
	"accountId",
);
if (!accountId)
	throw new Error(`no createProject form on /${account}/projects: is the bot an editor there?`);
const projectUrl = await remoteForm("projects.remote.ts", "createProject", {
	accountId,
	name: `Smoke ${stamp}`,
});
const projectId = hiddenValue(await (await fetchAsBot(`${base}${projectUrl}`)).text(), "projectId");
if (!projectId) throw new Error(`no createSong form on ${projectUrl}`);
const songUrl = await remoteForm("songs.remote.ts", "createSong", {
	projectId,
	title: "Test loop in D",
});
const html = await (await fetchAsBot(`${base}${songUrl}`)).text();
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
		sizeBytes: bytes.length,
	});
	const blob = await upload(pathname, bytes, {
		access: "public",
		handleUploadUrl: `${base}/api/upload`,
		// The token route needs the bot's cookie too (the client keeps its own fetch, patched or not).
		headers: { cookie: `preview_token=${token}`, origin: base },
		contentType: "audio/wav",
		multipart: true,
	});
	const { durationSeconds, channels, peaks } = analyzeWav(bytes);
	await post(`/api/stems/${stemId}/ready`, { url: blob.url, durationSeconds, channels, peaks });
	console.log(
		`  ${filename} → ${pathname} (${durationSeconds.toFixed(1)}s, ${channels}ch, ${Date.now() - t0} ms)`,
	);
}

const page = await (await fetchAsBot(`${base}${songUrl}`)).text();
const ready = `${page.match(/Stems \((\d+)\)/)?.[1] ?? "?"} stems`;
console.log(`song page reports: ${ready} · open ${base}${songUrl}`);
