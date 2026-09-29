/**
 * The Grand Piano's samples (docs/piano.md, "Sample tiers"): from the
 * Salamander Grand Piano's lossless recordings (sfzinstruments on GitHub,
 * CC BY 3.0, 48 kHz 24-bit FLAC) to the three tiers the piano plays:
 *
 *   demo      one layer (v10), mp3 VBR q2, 10 s with a fade  → static/kits/piano (committed, ~3.5 MB)
 *   standard  four layers (v4 v8 v12 v16) + the 88 release samples, the same mp3  → Blob, ~16 MB
 *   hires     six layers (v2 v5 v8 v11 v14 v16) + releases, FLAC 16-bit 44.1 kHz, full length → Blob, ~80 MB
 *
 *   bun run samples:piano -- --download   fetch the FLACs into .samples/salamander (gitignored, ~400 MB)
 *   bun run samples:piano                 encode all three tiers into static/ and .samples/piano
 *   bun run samples:piano -- --upload     put the standard and hires tiers in this stage's public Blob store
 *                                         (APP_ENV=preview for staging; production from Kevin's machine)
 *
 * The files keep their Salamander names (A0, Ds1, … C8, with `s` for a
 * sharp) and go under piano/v1/<tier>/; a re-encode gets a new version
 * prefix, because Blob serves them with a year-long cache header.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { put } from "@vercel/blob";

const run = promisify(execFile);

const NOTES = Array.from({ length: 30 }, (_, i) => 21 + 3 * i);
const NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
const name = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
const TIERS = {
	demo: { layers: [10], releases: false, ext: "mp3" },
	standard: { layers: [4, 8, 12, 16], releases: true, ext: "mp3" },
	hires: { layers: [2, 5, 8, 11, 14, 16], releases: true, ext: "flac" },
} as const;
const SRC = ".samples/salamander";
const OUT = {
	demo: "static/kits/piano",
	standard: ".samples/piano/standard",
	hires: ".samples/piano/hires",
};
const VERSION = "v1";
const GITHUB =
	"https://raw.githubusercontent.com/sfzinstruments/SalamanderGrandPiano/master/Samples";

const args = new Set(process.argv.slice(2));
const ffmpeg =
	(await run("which", ["ffmpeg"]).then(
		(r) => r.stdout.trim(),
		() => "",
	)) || (await import("ffmpeg-static")).default;
if (!ffmpeg) throw new Error("ffmpeg is needed (apt install ffmpeg, or the ffmpeg-static package)");

async function download() {
	await mkdir(SRC, { recursive: true });
	const wanted = new Set<string>();
	for (const tier of Object.values(TIERS))
		for (const v of tier.layers) for (const m of NOTES) wanted.add(`${name(m)}v${v}`);
	for (let i = 1; i <= 88; i++) wanted.add(`rel${i}`);
	let n = 0;
	const queue = [...wanted].filter((f) => !existsSync(`${SRC}/${f}.flac`));
	await Promise.all(
		Array.from({ length: 8 }, async () => {
			for (let f = queue.shift(); f; f = queue.shift()) {
				const url = `${GITHUB}/${f.replace(/^([A-G])s/, "$1#")}.flac`;
				const res = await fetch(url);
				if (!res.ok) throw new Error(`${res.status} for ${url}`);
				await writeFile(`${SRC}/${f}.flac`, Buffer.from(await res.arrayBuffer()));
				n++;
			}
		}),
	);
	console.log(`downloaded ${n} files; ${wanted.size} present`);
}

async function encodeOne(src: string, dest: string, ext: "mp3" | "flac", seconds: number | null) {
	if (existsSync(dest) && (await stat(dest)).size > 0) return false;
	const trim = seconds ? ["-t", String(seconds), "-af", `afade=t=out:st=${seconds - 1}:d=1`] : [];
	const codec =
		ext === "mp3"
			? ["-c:a", "libmp3lame", "-q:a", "2"]
			: ["-ar", "44100", "-sample_fmt", "s16", "-c:a", "flac", "-compression_level", "8"];
	await run(ffmpeg, ["-v", "error", "-y", "-i", src, ...trim, ...codec, dest]).catch(
		(e: unknown) => {
			throw new Error(`ffmpeg failed on ${src}: ${e instanceof Error ? e.message : String(e)}`);
		},
	);
}

async function encode() {
	for (const [tier, spec] of Object.entries(TIERS) as [
		keyof typeof TIERS,
		(typeof TIERS)[keyof typeof TIERS],
	][]) {
		const out = OUT[tier];
		await mkdir(out, { recursive: true });
		const jobs: [string, string][] = [];
		for (const v of spec.layers)
			for (const m of NOTES)
				jobs.push([
					`${SRC}/${name(m)}v${v}.flac`,
					`${out}/${tier === "demo" ? name(m) : `${name(m)}-v${v}`}.${spec.ext}`,
				]);
		if (spec.releases)
			for (let i = 1; i <= 88; i++)
				jobs.push([`${SRC}/rel${i}.flac`, `${out}/rel-${i}.${spec.ext}`]);
		const seconds = spec.ext === "mp3" ? 10 : null;
		let made = 0;
		await Promise.all(
			Array.from({ length: 4 }, async () => {
				for (let j = jobs.shift(); j; j = jobs.shift())
					if (await encodeOne(j[0], j[1], spec.ext, j[0].includes("/rel") ? null : seconds)) made++;
			}),
		);
		const files = (await readdir(out)).filter((f) => f.endsWith(`.${spec.ext}`));
		let bytes = 0;
		for (const f of files) bytes += (await stat(`${out}/${f}`)).size;
		console.log(
			`${tier}: ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB (${made} encoded now) in ${out}`,
		);
	}
}

async function upload() {
	const token = process.env.BLOB_READ_WRITE_TOKEN?.trim().replace(/^["']+|["']+$/g, "");
	if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is needed (run through varlock)");
	for (const tier of ["standard", "hires"] as const) {
		const out = OUT[tier];
		const files = (await readdir(out)).filter((f) => f.endsWith(`.${TIERS[tier].ext}`));
		let n = 0;
		const queue = [...files];
		await Promise.all(
			Array.from({ length: 6 }, async () => {
				for (let f = queue.shift(); f; f = queue.shift()) {
					const body = await readFile(`${out}/${f}`);
					await put(`piano/${VERSION}/${tier}/${f}`, body, {
						access: "public",
						contentType: f.endsWith(".mp3") ? "audio/mpeg" : "audio/flac",
						addRandomSuffix: false,
						allowOverwrite: true,
						cacheControlMaxAge: 60 * 60 * 24 * 365,
						token,
					});
					n++;
				}
			}),
		);
		console.log(`${tier}: ${n} files uploaded to piano/${VERSION}/${tier}/`);
	}
}

if (args.has("--download")) await download();
if (!args.has("--download") && !args.has("--upload")) await encode();
if (args.has("--upload")) await upload();
