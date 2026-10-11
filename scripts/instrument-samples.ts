/**
 * The small sampled instruments' files (docs/piano.md, "The bass and the
 * guitar"), from FreePats' public-domain (CC0) recordings on GitHub into
 * static/kits/<id> as mp3 VBR q2, mono, up to a few seconds with a fade:
 * committed, so every stage serves them as static files with nothing to
 * upload. The engine (src/lib/audio/sampledInstruments.ts) lists the notes.
 *
 *   bun run samples:bass      FreePats electric-bass-YR, the finger set: E1 to D#2
 *   bun run samples:guitar    FreePats spanish-classical-guitar: G1 to C6
 *   bun run samples:eguitar   FreePats electric-guitar-FSBS-direct, the bridge pickup's loud takes: C2 to C#6
 *
 * The FLACs land in .samples/<id> (gitignored) and are kept for a re-encode.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { SAMPLED, sampleName, type SampledInstrumentId } from "../src/lib/audio/sampledInstruments";

const run = promisify(execFile);
/** The direct set names its files by note, string and take; the loud first take of each note. */
const EGUITAR_FILES: Record<number, string> = {
	36: "C2_s1_01",
	40: "E2_s1_01",
	41: "F2_s1_01",
	45: "A2_s2_01",
	48: "C3_s2_01",
	50: "D3_s3_01",
	52: "E3_s3_01",
	55: "G3_s4_01",
	59: "B3_s5_01",
	61: "C#4_s5_01",
	64: "E4_s6_01",
	67: "G4_s6_01",
	71: "B4_s6_01",
	72: "C5_s6_01",
	74: "D5_s6_01",
	77: "F5_s6_01",
	80: "G#5_s6_01",
	82: "A#5_s6_01",
	85: "C#6_s6_01",
};
const SOURCES: Record<
	SampledInstrumentId,
	{ base: string; file: (midi: number) => string; seconds: number; ext?: string }
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
	eguitar: {
		base: "https://raw.githubusercontent.com/freepats/electric-guitar-FSBS-direct/master/samples/bridge",
		file: (midi) => EGUITAR_FILES[midi]!,
		seconds: 4,
		ext: "wav",
	},
};

const id = process.argv[2] as SampledInstrumentId;
if (!id || !(id in SOURCES)) throw new Error("which instrument? bass, guitar or eguitar");
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
const { base, file, seconds, ext = "flac" } = SOURCES[id];
for (const midi of SAMPLED[id].notes) {
	const name = sampleName(midi);
	const flac = `${src}/${name}.${ext}`;
	if (!existsSync(flac)) {
		const res = await fetch(`${base}/${encodeURIComponent(file(midi))}.${ext}`);
		if (!res.ok) throw new Error(`${file(midi)}.${ext}: ${res.status}`);
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
