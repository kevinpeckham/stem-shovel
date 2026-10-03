/**
 * The Electric Bass's samples (docs/piano.md, "The bass"): FreePats'
 * "Finger Bass YR" (Andrea Biasior, a Yamaha RBX, CC0 public domain;
 * freepats/electric-bass-YR on GitHub), twelve chromatic notes E1 to D#2
 * as FLAC, encoded to mp3 VBR q2, up to six seconds with a fade, into
 * static/kits/bass (committed, about a megabyte): every stage serves them
 * as static files, so there is nothing to upload. The engine shifts them
 * by octaves for the rest of the range.
 *
 *   bun run samples:bass    fetch the FLACs into .samples/bass (gitignored) and encode
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const GITHUB = "https://raw.githubusercontent.com/freepats/electric-bass-YR/master/samples/finger";
const SRC = ".samples/bass";
const OUT = "static/kits/bass";
/** The source files and the note each is (the SFZ's keys: E = 28). */
const NOTES: [string, string][] = [
	["E", "E1"],
	["F", "F1"],
	["F#", "Fs1"],
	["G", "G1"],
	["G#", "Gs1"],
	["A", "A1"],
	["A#", "As1"],
	["B", "B1"],
	["C", "C2"],
	["C#", "Cs2"],
	["D", "D2"],
	["D#", "Ds2"],
];

const ffmpeg: string =
	(await run("which", ["ffmpeg"]).then(
		(r) => r.stdout.trim(),
		() => "",
	)) ||
	(await import("ffmpeg-static")).default ||
	"";
if (!ffmpeg) throw new Error("ffmpeg is needed (apt install ffmpeg, or the ffmpeg-static package)");

await mkdir(SRC, { recursive: true });
await mkdir(OUT, { recursive: true });
for (const [file, note] of NOTES) {
	const src = `${SRC}/${note}.flac`;
	if (!existsSync(src)) {
		const res = await fetch(`${GITHUB}/${encodeURIComponent(file)}.flac`);
		if (!res.ok) throw new Error(`${file}.flac: ${res.status}`);
		await writeFile(src, Buffer.from(await res.arrayBuffer()));
	}
	await run(ffmpeg, [
		"-y",
		"-loglevel",
		"error",
		"-i",
		src,
		"-t",
		"6",
		"-af",
		"afade=t=out:st=5.5:d=0.5",
		"-ac",
		"1",
		"-codec:a",
		"libmp3lame",
		"-q:a",
		"2",
		`${OUT}/${note}.mp3`,
	]);
	console.log(`${note}.mp3`);
}
