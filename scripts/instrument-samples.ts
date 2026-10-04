/**
 * The small sampled instruments' files (docs/piano.md, "The bass and the
 * guitar"), from FreePats' public-domain (CC0) recordings on GitHub into
 * static/kits/<id> as mp3 VBR q2, mono, up to a few seconds with a fade:
 * committed, so every stage serves them as static files with nothing to
 * upload. The engine (src/lib/audio/sampledInstruments.ts) lists the notes.
 *
 *   bun run samples:bass      FreePats electric-bass-YR, the finger set: E1 to D#2
 *   bun run samples:guitar    FreePats spanish-classical-guitar: G1 to C6
 *
 * The FLACs land in .samples/<id> (gitignored) and are kept for a re-encode.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { SAMPLED, sampleName, type SampledInstrumentId } from "../src/lib/audio/sampledInstruments";

const run = promisify(execFile);
const SOURCES: Record<
	SampledInstrumentId,
	{ base: string; file: (midi: number) => string; seconds: number }
> = {
	bass: {
		base: "https://raw.githubusercontent.com/freepats/electric-bass-YR/master/samples/finger",
		// Their files are named by pitch class alone (one octave): E, F, F#…
		file: (midi) => ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][midi % 12]!,
		seconds: 6,
	},
	guitar: {
		base: "https://raw.githubusercontent.com/freepats/spanish-classical-guitar/master/samples",
		file: (midi) =>
			`${["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][midi % 12]}${Math.floor(midi / 12) - 1}`,
		seconds: 5,
	},
};

const id = process.argv[2] as SampledInstrumentId;
if (!id || !(id in SOURCES)) throw new Error("which instrument? bass or guitar");
const ffmpeg: string =
	(await run("which", ["ffmpeg"]).then(
		(r) => r.stdout.trim(),
		() => "",
	)) ||
	(await import("ffmpeg-static")).default ||
	"";
if (!ffmpeg) throw new Error("ffmpeg is needed (apt install ffmpeg, or the ffmpeg-static package)");

const src = `.samples/${id}`;
const out = `static/kits/${id}`;
await mkdir(src, { recursive: true });
await mkdir(out, { recursive: true });
const { base, file, seconds } = SOURCES[id];
for (const midi of SAMPLED[id].notes) {
	const name = sampleName(midi);
	const flac = `${src}/${name}.flac`;
	if (!existsSync(flac)) {
		const res = await fetch(`${base}/${encodeURIComponent(file(midi))}.flac`);
		if (!res.ok) throw new Error(`${file(midi)}.flac: ${res.status}`);
		await writeFile(flac, Buffer.from(await res.arrayBuffer()));
	}
	await run(ffmpeg, [
		"-y",
		"-loglevel",
		"error",
		"-i",
		flac,
		"-t",
		String(seconds),
		"-af",
		`afade=t=out:st=${seconds - 0.5}:d=0.5`,
		"-ac",
		"1",
		"-codec:a",
		"libmp3lame",
		"-q:a",
		"2",
		`${out}/${name}.mp3`,
	]);
	console.log(`${id}/${name}.mp3`);
}
