/**
 * Smoke test for the Blob upload flow. Drives the real `@vercel/blob/client`
 * upload() against a running dev server, exactly as the browser does.
 *
 * Usage: bun run stems && node scripts/blob-smoke.mjs [slug] [kick,hats,bass,keys]
 */
import { upload } from "@vercel/blob/client";
import { readFile } from "node:fs/promises";
const base = "http://localhost:5173";
const slug = process.argv[2] ?? "test-loop-in-d";
const names = (process.argv[3] ?? "kick,hats,bass,keys").split(",");
for (const n of names) {
	const body = await readFile(`static/stems/${n}.wav`);
	const t0 = Date.now();
	const res = await upload(`stems/${slug}/${n}.wav`, body, {
		access: "public",
		handleUploadUrl: `${base}/api/upload`,
		contentType: "audio/wav",
		multipart: true,
	});
	console.log(
		`uploaded ${res.pathname} (${body.length} B, ${Date.now() - t0} ms) -> ${res.url.replace(/^https:\/\/[^.]+\./, "https://<store>.")}`,
	);
}
