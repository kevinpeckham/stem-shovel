/**
 * Sandyne reads a Dawn `.sand` (docs/daw-interop-plan.md, "Sandyne"):
 * exports the fixture song (scripts/interop/fixture.ts) as a Sandyne
 * project with its samples beside it, has Sandyne's own headless
 * commands inspect it and render a WAV per track, and judges the result
 * against the arrangement: every track listed with its clips, and each
 * track's render silent until its first clip starts and sounding after.
 * Nothing needs a display.
 *
 *   bun scripts/interop/sandyne.ts
 *
 * Needs Sandyne (SANDYNE_BIN, default ~/Applications/Sandyne/sandyne;
 * the Linux build from sandyne.com, free).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { EXPORT_DEFAULTS, exportSong } from "#lib/audio/studioExport.js";
import { arrangement, engine, readWav } from "./fixture";

const bin = process.env.SANDYNE_BIN ?? resolve(homedir(), "Applications/Sandyne/sandyne");
if (!existsSync(bin)) fail(`Sandyne not found at ${bin} (SANDYNE_BIN)`);
const out = resolve(".interop/sandyne");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// The project and its samples, through the same `exportSong` the page uses.
const [file] = await exportSong(
	engine,
	"Interop song",
	{ ...EXPORT_DEFAULTS, mix: false, sandyne: true },
	{ name: "Stem Shovel Dawn", version: "interop" },
);
for (const e of file!.entries!) {
	const path = join(out, e.name);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(
		path,
		e.data instanceof Blob
			? new Uint8Array(await e.data.arrayBuffer())
			: e.data instanceof Uint8Array
				? e.data
				: new Uint8Array(e.data),
	);
}
const project = join(out, "Interop song.sand");

// Sandyne's own reading of it (ALSA and JACK complaints on stderr are the VM's lack of a sound card).
const sandyne = (...args: string[]) =>
	execFileSync(bin, args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
		timeout: 300_000,
	});
const inspect = sandyne("inspect", project);
console.log(inspect.trim());
const renders = join(out, "renders");
sandyne("rendertracks", project, "--output-dir", renders, "--format", "wav", "--quiet");

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
	console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
	if (!ok) failures.push(what);
};

check(
	new RegExp(`^Tracks: ${arrangement.tracks.length}$`, "m").test(inspect),
	`inspect lists ${arrangement.tracks.length} tracks`,
);
for (const [i, t] of arrangement.tracks.entries()) {
	const clips = arrangement.clips.filter((c) => c.trackId === t.id);
	const kinds = clips
		.sort((a, b) => a.start - b.start)
		.map((c) => (c.notes ? "notes" : "sample"))
		.join(",");
	check(
		inspect.includes(`[${i}] ${t.name} - ${clips.length} clip(s) [${kinds}]`),
		`inspect lists ${t.name} with ${clips.length} clip(s) [${kinds}]`,
	);
}
check(/^BPM: 120\.00$/m.test(inspect), "inspect reads the tempo");

// Each track's render: silence until the first clip, sound within a second after it.
const files = readdirSync(renders).filter((f) => f.endsWith(".wav"));
check(files.length === arrangement.tracks.length, `${files.length} track renders`);
for (const [i, t] of arrangement.tracks.entries()) {
	const file = files.find((f) => f.startsWith(`Interop song_${String(i + 1).padStart(2, "0")}_`));
	if (!file) {
		check(false, `a render for ${t.name}`);
		continue;
	}
	const first = Math.min(
		...arrangement.clips.filter((c) => c.trackId === t.id).map((c) => c.start),
	);
	const peaks = peaksOf(join(renders, file), 0.05);
	// Sandyne starts a note's voice at the head of the render block it falls in: a few ms early.
	const before = peaks.slice(0, Math.max(0, Math.floor((first - 0.1) / 0.05)));
	const after = peaks.slice(Math.ceil(first / 0.05), Math.ceil(first / 0.05) + 20);
	const quiet = Math.max(0, ...before);
	const loud = Math.max(0, ...after);
	check(
		quiet < 0.01 && loud > 0.03,
		`${t.name} render silent until ${first}s (peak ${quiet.toFixed(3)}) and sounding after (peak ${loud.toFixed(3)})`,
	);
}
if (failures.length) fail(`${failures.length} check(s) failed`);
console.log("Sandyne read the project as written.");

/** The peak of each `step`-second window of a WAV, over its channels. */
function peaksOf(path: string, step: number): number[] {
	const { channels, sampleRate } = readWav(path);
	const per = Math.round(sampleRate * step);
	const peaks: number[] = [];
	for (const ch of channels)
		for (let i = 0; i < ch.length; i++) {
			const w = Math.floor(i / per);
			peaks[w] = Math.max(peaks[w] ?? 0, Math.abs(ch[i]!));
		}
	return peaks;
}

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}
