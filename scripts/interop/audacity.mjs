/**
 * Audacity reads a Dawn session bundle (docs/daw-interop-plan.md, tier
 * B): runs Audacity under a virtual display with its scripting pipe
 * (mod-script-pipe) and its own settings folder, imports the bundle's
 * stems (Audacity reads no project file and ignores a clip's time
 * reference: the README sends its users to the stems, which start at
 * zero) and the label track through the Import Labels menu command with
 * the path typed into its file dialog, then judges what Audacity holds
 * against the arrangement the bundle came from (.interop/arrangement.json,
 * from `bun run interop:bundle`).
 *
 *   bun run interop:bundle && bun run interop:audacity
 *
 * Needs Audacity 3 (AUDACITY_BIN, default `audacity`: `apt install
 * audacity` carries mod-script-pipe), Xvfb and xdotool.
 */
import { spawn, execFileSync } from "node:child_process";
import {
	createReadStream,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	rmSync,
	writeFileSync,
	writeSync,
	constants,
} from "node:fs";
import { resolve } from "node:path";

const bin = process.env.AUDACITY_BIN ?? "audacity";
const bundle = resolve(".interop/bundle");
const out = resolve(".interop/audacity");
const display = ":98";
if (!existsSync(bundle)) fail("No .interop/bundle: run `bun run interop:bundle` first");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const arrangement = JSON.parse(readFileSync(".interop/arrangement.json", "utf8"));

// Audacity's own settings (XDG_CONFIG_HOME: wxWidgets puts audacity.cfg under it), with the
// scripting module enabled (status 1; a module Audacity has not seen is "new", 4, and stays
// unloaded), no welcome dialog, no update check, and a temp folder of its own under .interop.
const config = resolve(".interop/audacity-config");
const tmp = resolve(".interop/audacity-tmp");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(`${config}/audacity`, { recursive: true });
mkdirSync(tmp, { recursive: true });
const modulePath = process.env.AUDACITY_MODULE ?? "/usr/lib/audacity/modules/mod-script-pipe.so";
writeFileSync(
	`${config}/audacity/audacity.cfg`,
	[
		"[Module]",
		"mod-script-pipe=1",
		"[ModulePath]",
		`mod-script-pipe=${modulePath}`,
		"[ModuleDateTime]",
		"mod-script-pipe=2024-04-05T06:22:31",
		"[GUI]",
		"ShowSplashScreen=0",
		"[Update]",
		"DefaultUpdatesCheckingFlag=0",
		"UpdateNoticeShown=1",
		"[Directories]",
		`TempDir=${tmp}`,
		"",
	].join("\n"),
);

const xvfb = spawn("Xvfb", [display, "-screen", "0", "1280x800x24"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
const env = {
	...process.env,
	DISPLAY: display,
	XDG_CONFIG_HOME: config,
	XDG_DATA_HOME: resolve(".interop/audacity-data"),
};
const audacity = spawn(bin, [], { env, stdio: "ignore" });
const uid = process.getuid();
const toPipe = `/tmp/audacity_script_pipe.to.${uid}`;
const fromPipe = `/tmp/audacity_script_pipe.from.${uid}`;

// The pipe: a line per command, lines back until "BatchCommand finished: …".
let toFd = -1;
for (let i = 0; i < 60 && toFd < 0; i++) {
	try {
		toFd = openSync(toPipe, constants.O_WRONLY | constants.O_NONBLOCK);
	} catch {
		await new Promise((r) => setTimeout(r, 1000));
	}
}
if (toFd < 0)
	await bail("Audacity opened no scripting pipe in 60 s (is mod-script-pipe installed?)");
const from = createReadStream(fromPipe, { encoding: "utf8" });
let pending = null;
let buffer = "";
from.on("data", (chunk) => {
	buffer += chunk;
	let nl;
	while ((nl = buffer.indexOf("\n")) >= 0) {
		const line = buffer.slice(0, nl);
		buffer = buffer.slice(nl + 1);
		if (!pending) continue;
		pending.lines.push(line);
		if (line.startsWith("BatchCommand finished")) {
			const p = pending;
			pending = null;
			p.resolve(p.lines);
		}
	}
});
function command(text, { timeout = 60_000, during } = {}) {
	return new Promise((resolve, reject) => {
		pending = { lines: [], resolve };
		writeSync(toFd, `${text}\n`);
		const timer = setTimeout(
			() => reject(new Error(`${text}: no answer in ${timeout / 1000} s`)),
			timeout,
		);
		const done = pending;
		const original = done.resolve;
		done.resolve = (lines) => {
			clearTimeout(timer);
			original(lines);
			resolve(lines);
		};
		during?.();
	});
}
const json = (lines) => JSON.parse(lines.filter((l) => !l.startsWith("BatchCommand")).join("\n"));
const xdotool = (...args) => {
	try {
		return execFileSync("xdotool", args, {
			env,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return "";
	}
};
const windowNamed = (pattern) =>
	xdotool("search", "--name", pattern).split("\n").filter(Boolean).at(-1);

try {
	await command("GetInfo: Type=Tracks", { timeout: 30_000 });
	// The stems, each a track from zero.
	const stems = readFileSync(`${bundle}/README.txt`, "utf8") && listDir(`${bundle}/stems`);
	for (const stem of stems) {
		const answer = await command(`Import2: Filename="${bundle}/stems/${stem}"`);
		if (!answer.at(-1)?.endsWith("OK")) await bail(`Import2 ${stem}: ${answer.join(" ")}`);
	}
	// The labels: the menu command opens a GTK file dialog; the path goes into its location bar.
	const typed = new Promise((resolve) => {
		const poll = setInterval(() => {
			const id = windowNamed("Select a text file");
			if (!id) return;
			clearInterval(poll);
			xdotool("windowfocus", "--sync", id);
			setTimeout(() => {
				xdotool("key", "ctrl+l");
				setTimeout(() => {
					xdotool("type", "--delay", "15", `${bundle}/labels.txt`);
					setTimeout(() => {
						xdotool("key", "Return");
						resolve();
					}, 400);
				}, 400);
			}, 400);
		}, 500);
		setTimeout(() => clearInterval(poll), 40_000);
	});
	await command("ImportLabels:", { timeout: 45_000 });
	await typed;
	const tracks = json(await command("GetInfo: Type=Tracks Format=JSON"));
	const labels = json(await command("GetInfo: Type=Labels Format=JSON"));
	writeFileSync(`${out}/tracks.json`, JSON.stringify({ tracks, labels }, null, "\t"));

	// The judgment.
	const failures = [];
	const check = (ok, what) => {
		console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
		if (!ok) failures.push(what);
	};
	const waves = tracks.filter((t) => t.kind === "wave");
	check(waves.length === stems.length, `${waves.length} audio tracks from ${stems.length} stems`);
	for (const [i, t] of arrangement.tracks.entries()) {
		const name = `${String(i + 1).padStart(2, "0")} ${t.name}`;
		const w = waves.find((x) => x.name === name);
		check(!!w, `a track named ${name}`);
		if (w)
			check(
				Math.abs(w.start) < 0.001 && Math.abs(w.end - arrangement.songEnd) < 0.01,
				`${name} runs from 0 to the song's end (${w.start}–${w.end} s, song ${arrangement.songEnd} s)`,
			);
	}
	const labelTrack = labels.flatMap(([, list]) => list);
	for (const m of arrangement.markers)
		check(
			labelTrack.some(([t0, , text]) => Math.abs(t0 - m.t) < 0.001 && text === m.name),
			`marker ${m.name} at ${m.t} s`,
		);
	check(
		labelTrack.some(([t0, , text]) => t0 === 0 && text === `Tempo ${arrangement.bpm}`),
		"the tempo label at zero",
	);
	for (const c of arrangement.tempoChanges)
		check(
			labelTrack.some(
				([t0, , text]) => Math.abs(t0 - c.start) < 0.001 && text === `Tempo ${c.bpm}`,
			),
			`tempo ${c.bpm} at ${c.start} s`,
		);
	for (const c of arrangement.meterChanges)
		check(
			labelTrack.some(
				([t0, , text]) => Math.abs(t0 - c.start) < 0.001 && text === `Meter ${c.beatsPerBar}/4`,
			),
			`meter ${c.beatsPerBar}/4 at ${c.start} s`,
		);
	if (failures.length) await bail(`${failures.length} check(s) failed`);
	console.log("Audacity read the bundle as written.");
} catch (e) {
	await bail(String(e?.message ?? e));
}
await quit(0);

function listDir(dir) {
	return execFileSync("ls", [dir], { encoding: "utf8" })
		.split("\n")
		.filter((f) => f.endsWith(".wav"))
		.sort();
}
async function bail(message) {
	console.error(message);
	try {
		execFileSync(
			"node_modules/ffmpeg-static/ffmpeg",
			[
				"-loglevel",
				"error",
				"-y",
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
		console.error(`screen in ${out}/screen.png`);
	} catch {}
	await quit(1);
}
async function quit(code) {
	audacity.kill("SIGTERM");
	await new Promise((r) => setTimeout(r, 1500));
	audacity.kill("SIGKILL");
	xvfb.kill();
	rmSync(tmp, { recursive: true, force: true });
	process.exit(code);
}
function fail(message) {
	console.error(message);
	process.exit(1);
}
