/**
 * Reaper reads a Dawn session bundle (docs/daw-interop-plan.md, tier B):
 * runs Reaper under a virtual display with scripts/interop/reaper.lua,
 * which inserts the bundle's clips at their BWF time references and the
 * MIDI file with its tempo map, saves the project and writes what it
 * holds; then judges that against the arrangement the bundle came from
 * (.interop/arrangement.json, from `bun run interop:bundle`).
 *
 *   bun run interop:bundle && bun run interop:reaper
 *
 * Needs Reaper (REAPER_BIN, default ~/opt/reaper/reaper; the Linux
 * build from reaper.fm, evaluation or licensed), Xvfb and xdotool
 * (`apt install xvfb xdotool`). The MIDI import prompt, when Reaper shows
 * one, is answered with Return.
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const bin = process.env.REAPER_BIN ?? resolve(homedir(), "opt/reaper/reaper");
const bundle = resolve(".interop/bundle");
const out = resolve(".interop/reaper");
const display = ":99";
if (!existsSync(bin)) fail(`Reaper not found at ${bin} (REAPER_BIN)`);
if (!existsSync(bundle)) fail("No .interop/bundle: run `bun run interop:bundle` first");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const xvfb = spawn("Xvfb", [display, "-screen", "0", "1280x800x24"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
const env = { ...process.env, DISPLAY: display, INTEROP_BUNDLE: bundle, INTEROP_OUT: out };
// Reaper's own configuration folder for these runs (`-cfgfile`), so the MIDI import dialog's
// options (reaper.ini `midiimport`, a bit set the dialog remembers) are the ones the check wants
// and nothing touches the machine's Reaper settings.
const cfg = resolve(".interop/reaper-config");
mkdirSync(cfg, { recursive: true });
const midiimport = process.env.REAPER_MIDIIMPORT ?? "7";
writeFileSync(`${cfg}/reaper.ini`, `[reaper]\nmidiimport=${midiimport}\n`);
const reaper = spawn(
	bin,
	["-cfgfile", `${cfg}/reaper.ini`, "-nosplash", "-new", resolve("scripts/interop/reaper.lua")],
	{
		env,
		stdio: ["ignore", "pipe", "pipe"],
	},
);
let stderr = "";
reaper.stderr.on("data", (d) => (stderr += d));
// Any dialog Reaper raises (the MIDI import options, an evaluation notice) gets Return.
const dialogs = [];
const poke = setInterval(() => {
	try {
		const quiet = { env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };
		const ids = execFileSync("xdotool", ["search", "--onlyvisible", "--name", "."], quiet)
			.trim()
			.split("\n")
			.filter(Boolean);
		for (const id of ids) {
			const name = execFileSync("xdotool", ["getwindowname", id], quiet).trim();
			if (/REAPER v|^reaper$|^$/i.test(name) || name.includes(".RPP")) continue;
			if (!dialogs.includes(name)) dialogs.push(name);
			// No window manager on the virtual display: focus the window itself, then press Return in it.
			execFileSync("xdotool", ["windowfocus", "--sync", id], { env, stdio: "ignore" });
			execFileSync("xdotool", ["key", "--window", id, "Return"], { env, stdio: "ignore" });
		}
	} catch {}
}, 1500);
const screenshot = () => {
	try {
		execFileSync(
			resolve("node_modules/ffmpeg-static/ffmpeg"),
			[
				"-y",
				"-loglevel",
				"quiet",
				"-f",
				"x11grab",
				"-video_size",
				"1280x800",
				"-i",
				display,
				"-frames:v",
				"1",
				`${out}/screen.png`,
			],
			{ env, stdio: "ignore" },
		);
		return `${out}/screen.png`;
	} catch {
		return "no screenshot";
	}
};
const exit = await Promise.race([
	new Promise((r) => reaper.on("exit", r)),
	new Promise((r) => setTimeout(() => r("timeout"), 120_000)),
]);
clearInterval(poke);
const shot = exit === "timeout" ? screenshot() : null;
if (exit === "timeout") reaper.kill("SIGKILL");
xvfb.kill();
if (!existsSync(`${out}/result.json`))
	fail(
		`No result from Reaper (exit ${exit}; windows seen: ${dialogs.join(", ") || "none"}; ${shot ?? ""}).\n${stderr.slice(-1500)}`,
	);

const got = JSON.parse(readFileSync(`${out}/result.json`, "utf8"));
const want = JSON.parse(readFileSync(".interop/arrangement.json", "utf8"));
const near = (a, b, tol = 0.002) => Math.abs(a - b) <= tol;
const problems = [];
const check = (ok, what) => {
	console.log(`${ok ? "ok " : "NOT"} ${what}`);
	if (!ok) problems.push(what);
};
console.log(`Reaper ${got.app}; dialogs answered: ${dialogs.length ? dialogs.join(", ") : "none"}`);
for (const c of got.clips) {
	const m = /^\d+ (.+) - (.+) @ ([\d.]+)s\.wav$/.exec(c.file);
	const start = Number(m?.[3]);
	check(
		c.position !== null && near(c.position, start),
		`${c.file}: at ${start} s (Reaper put it at ${c.position?.toFixed(4)}; BWF ${c.bwf} @ ${c.sampleRate} Hz)`,
	);
	const clip = want.clips.find((x) => x.start === start && x.sourceId);
	if (clip)
		check(
			near(c.length, clip.duration, 0.01),
			`${c.file}: ${clip.duration} s long (${c.length?.toFixed(4)})`,
		);
}
const tempos = [
	{ at: 0, bpm: want.bpm, numerator: want.beatsPerBar },
	...(want.tempoChanges ?? []).map((t) => ({ at: t.start, bpm: t.bpm })),
];
for (const t of tempos) {
	const hit = got.tempos.find((g) => near(g.at, t.at, 0.01));
	check(
		hit && near(hit.bpm, t.bpm, 0.01),
		`tempo ${t.bpm} at ${t.at} s (${hit ? `${hit.bpm} at ${hit.at.toFixed(3)}` : "missing"})`,
	);
}
for (const m of want.meterChanges ?? []) {
	const hit = got.tempos.find((g) => near(g.at, m.start, 0.01));
	check(
		hit && hit.numerator === m.beatsPerBar,
		`meter ${m.beatsPerBar}/4 at ${m.start} s (${hit ? `${hit.numerator}/${hit.denominator}` : "missing"})`,
	);
}
for (const m of want.markers ?? []) {
	const hit = got.markers.find((g) => g.name === m.name);
	check(
		hit && near(hit.at, m.t, 0.01),
		`marker "${m.name}" at ${m.t} s (${hit ? hit.at.toFixed(3) : "missing"})`,
	);
}
const midiClip = want.clips.find((c) => c.notes);
const midiItem = (got.midiItems ?? []).find((i) => i.notes > 0);
// A MIDI file imports as one item from zero; the notes inside must sit where the clip's do.
const firstNoteAt = midiClip.start - midiClip.offset + Math.min(...midiClip.notes.map((n) => n.t));
check(
	midiItem &&
		midiItem.firstNote &&
		near(midiItem.firstNote.at, firstNoteAt, 0.01) &&
		midiItem.notes === midiClip.notes.length,
	`MIDI part: ${midiClip.notes.length} notes, the first at ${firstNoteAt} s (${midiItem ? `${midiItem.notes} notes, first at ${midiItem.firstNote?.at.toFixed(3)} on "${midiItem.track}"` : "missing"})`,
);
if (got.log.length) console.log("Reaper said:", got.log.join(" | "));
console.log(`Project saved: ${out}/reaper.RPP`);
if (problems.length) fail(`${problems.length} check${problems.length === 1 ? "" : "s"} failed`);
console.log("Reaper reads the bundle as Dawn meant it.");

function fail(msg) {
	console.error(msg);
	process.exit(1);
}
