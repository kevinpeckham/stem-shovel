/**
 * Reaper opens a project Dawn wrote (docs/dawproject-plan.md, roadmap
 * step 3; docs/daw-interop-plan.md, tier B): the fixture song with a bus,
 * a send, envelopes and a track color added goes out through `exportSong`
 * as a Reaper project (utils/rpp.ts) to `.interop/rpp/`; Reaper runs under
 * a virtual display with scripts/interop/rpp.lua, which opens it, writes
 * what it holds and saves the project again; this judges what Reaper read
 * against the arrangement, then reads Reaper's own saving of it back
 * through utils/rppRead.ts and judges that too.
 *
 *   bun run interop:rpp
 *
 * Needs Reaper (REAPER_BIN, default ~/opt/reaper/reaper), Xvfb and
 * xdotool, as `bun run interop:reaper` does.
 */
import {
	execFileSync,
	spawn,
	type ExecFileSyncOptionsWithStringEncoding,
} from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { unzipSync } from "fflate";
import { exportSong } from "#lib/audio/studioExport.js";
import { readRpp } from "#lib/utils/rppRead.js";
import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import { arrangement as fixture, engine as fixtureEngine, readWav } from "./fixture";

const bin = process.env.REAPER_BIN ?? resolve(homedir(), "opt/reaper/reaper");
const out = resolve(".interop/rpp");
const display = ":98";
if (!existsSync(bin)) fail(`Reaper not found at ${bin} (REAPER_BIN)`);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// The fixture with what the Reaper writer has to carry on top: a bus the drums go to, a send, envelopes, a color.
const arrangement: StudioArrangement = {
	...fixture,
	sampleRate: 48000,
	// The master's own lane: full until 6 s, then (over 10 ms) silent; a render across 6 s shows Reaper honors it.
	masterAutomation: {
		volume: [
			{ t: 0, v: 1 },
			{ t: 6, v: 1 },
			{ t: 6.01, v: 0 },
		],
	},
	buses: [{ id: "b-drums", name: "Drums", colour: "sea", gain: 0.9, pan: 0, muted: false }],
	tracks: fixture.tracks.map((t) =>
		t.id === "t-kick"
			? { ...t, colour: "clay", output: "b-drums" }
			: t.id === "t-hats"
				? { ...t, output: "b-drums", muted: true }
				: t.id === "t-bass"
					? {
							...t,
							sends: [{ bus: "b-drums", level: 0.5, pre: true }],
							// The lane differs from the knob (-0.3), so the pan Reaper shows in read mode tells which way its envelope runs.
							// The send lane rides the receive on Drums; the mute lane mutes the Bass from 3 s (Reaper's envelope says 0 there).
							automation: {
								pan: [{ t: 0, v: 0.6 }],
								"send:b-drums": [
									{ t: 0, v: 0.5 },
									{ t: 2, v: 1 },
								],
								mute: [
									{ t: 0, v: 0 },
									{ t: 3, v: 1 },
								],
							},
						}
					: t.id === "t-keys"
						? {
								...t,
								automation: {
									volume: [
										{ t: 0, v: 1 },
										{ t: 4, v: 0.5 },
									],
								},
							}
						: t,
	),
};
const engine = { ...fixtureEngine, arrangement };
const title = "Interop song";
const files = await exportSong(
	engine,
	title,
	{
		mix: false,
		tracks: false,
		buses: false,
		dawproject: false,
		bundle: false,
		sandyne: false,
		reaper: true,
		format: "wav",
		bits: 24,
		normalize: false,
	},
	{ name: "Stem Shovel Dawn", version: "interop" },
);
const zip = unzipSync(new Uint8Array(await files[0]!.blob.arrayBuffer()));
for (const [name, data] of Object.entries(zip)) {
	const path = join(out, name);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, data);
}
const rpp = join(out, `${title}.rpp`);
console.log(`${Object.keys(zip).length} files in ${out}`);

const xvfb = spawn("Xvfb", [display, "-screen", "0", "1280x800x24"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
const env = { ...process.env, DISPLAY: display, INTEROP_RPP: rpp, INTEROP_OUT: out };
const cfg = resolve(".interop/reaper-config");
mkdirSync(cfg, { recursive: true });
if (!existsSync(`${cfg}/reaper.ini`)) writeFileSync(`${cfg}/reaper.ini`, "[reaper]\n");
const reaper = spawn(
	bin,
	["-cfgfile", `${cfg}/reaper.ini`, "-nosplash", "-new", resolve("scripts/interop/rpp.lua")],
	{ env, stdio: ["ignore", "pipe", "pipe"] },
);
let stderr = "";
reaper.stderr.on("data", (d) => (stderr += d));
const dialogs: string[] = [];
const poke = setInterval(() => {
	try {
		const quiet: ExecFileSyncOptionsWithStringEncoding = {
			env,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		};
		const ids = execFileSync("xdotool", ["search", "--onlyvisible", "--name", "."], quiet)
			.trim()
			.split("\n")
			.filter(Boolean);
		for (const id of ids) {
			const name = execFileSync("xdotool", ["getwindowname", id], quiet).trim();
			if (/REAPER v|^reaper$|^$/i.test(name) || /\.rpp/i.test(name)) continue;
			if (!dialogs.includes(name)) dialogs.push(name);
			execFileSync("xdotool", ["windowfocus", "--sync", id], { env, stdio: "ignore" });
			execFileSync("xdotool", ["key", "--window", id, "Return"], { env, stdio: "ignore" });
		}
	} catch {}
}, 1500);
const exit = await Promise.race([
	new Promise((r) => reaper.on("exit", r)),
	new Promise((r) => setTimeout(() => r("timeout"), 120_000)),
]);
clearInterval(poke);
if (exit === "timeout") reaper.kill("SIGKILL");
xvfb.kill();
if (!existsSync(`${out}/result.json`))
	fail(
		`No result from Reaper (exit ${String(exit)}; windows seen: ${dialogs.join(", ") || "none"}).\n${stderr.slice(-1500)}`,
	);

interface Got {
	app: string;
	tracks: {
		name: string;
		volume: number;
		pan: number;
		muted: boolean;
		solo: boolean;
		folderDepth: number;
		color?: { r: number; g: number; b: number };
		receives: {
			from: string;
			volume: number;
			mode: number;
			volumeEnvelope?: { at: number; value: number }[];
		}[];
		volumeEnvelope?: { at: number; value: number }[];
		panEnvelope?: { at: number; value: number }[];
		muteEnvelope?: { at: number; value: number; shape: number }[];
		items: {
			name?: string;
			position: number;
			length: number;
			volume: number;
			takeVolume?: number;
			fadeIn: number;
			fadeOut: number;
			offset?: number;
			file?: string;
			sampleRate?: number;
			notes?: { at: number; ends: number; pitch: number; velocity: number }[];
		}[];
	}[];
	tempos: { at: number; bpm: number; numerator: number; denominator: number }[];
	markers: { at: number; name: string; region: boolean }[];
	sampleRate: number;
	notes: string;
	masterVolume: number;
	masterVolumeEnvelope?: { at: number; value: number }[];
	mixRender?: string;
	render?: string;
	log: string[];
}
const got: Got = JSON.parse(readFileSync(`${out}/result.json`, "utf8"));
const near = (a: number | undefined, b: number, tol = 0.002) =>
	a !== undefined && Math.abs(a - b) <= tol;
const problems: string[] = [];
const check = (ok: boolean | undefined, what: string) => {
	console.log(`${ok ? "ok " : "NOT"} ${what}`);
	if (!ok) problems.push(what);
};
console.log(`Reaper ${got.app}; dialogs answered: ${dialogs.length ? dialogs.join(", ") : "none"}`);

// ── What Reaper read ──
const byName = new Map(got.tracks.map((t) => [t.name, t]));
check(
	got.tracks.map((t) => t.name).join(", ") === "Bass, Keys, Piano part, Drums, Kick, Hats",
	`track order: Bass, Keys, Piano part, then the Drums folder with Kick and Hats (${got.tracks.map((t) => t.name).join(", ")})`,
);
for (const t of arrangement.tracks) {
	const g = byName.get(t.name);
	check(
		g && near(g.volume, t.gain) && near(g.pan, t.pan),
		`${t.name}: volume ${t.gain}, pan ${t.pan} (${g?.volume.toFixed(3)}, ${g?.pan.toFixed(3)})`,
	);
	check(
		g && g.muted === t.muted && g.solo === t.solo,
		`${t.name}: muted ${t.muted}, solo ${t.solo} (${g?.muted}, ${g?.solo})`,
	);
}
check(
	near(byName.get("Drums")?.folderDepth, 1) &&
		near(byName.get("Hats")?.folderDepth, -1) &&
		near(byName.get("Kick")?.folderDepth, 0),
	"Drums is a folder closed by Hats",
);
check(
	near(byName.get("Drums")?.volume, 0.9),
	`Drums: volume 0.9 (${byName.get("Drums")?.volume.toFixed(3)})`,
);
const kick = byName.get("Kick")?.color;
check(
	kick && near(kick.r, 0xd3, 2) && near(kick.g, 0x9a, 2) && near(kick.b, 0x7e, 2),
	`Kick is clay #D39A7E (${kick ? `${kick.r} ${kick.g} ${kick.b}` : "no color"})`,
);
const recv = byName.get("Drums")?.receives[0];
check(
	recv && recv.from === "Bass" && near(recv.volume, 0.5) && recv.mode === 3,
	`Drums receives Bass at 0.5, pre-fader (${recv ? `${recv.from} ${recv.volume.toFixed(3)} mode ${recv.mode}` : "none"})`,
);
const keysEnv = byName.get("Keys")?.volumeEnvelope;
check(
	keysEnv?.length === 2 &&
		near(keysEnv[0]!.value, 1) &&
		near(keysEnv[1]!.at, 4) &&
		near(keysEnv[1]!.value, 0.5),
	`Keys volume envelope: 1 at 0, 0.5 at 4 s (${keysEnv?.map((p) => `${p.value.toFixed(2)}@${p.at}`).join(", ") ?? "none"})`,
);
const muteEnv = byName.get("Bass")?.muteEnvelope;
check(
	muteEnv?.length === 2 &&
		near(muteEnv[0]!.value, 1) &&
		near(muteEnv[1]!.at, 3) &&
		near(muteEnv[1]!.value, 0) &&
		muteEnv[1]!.shape === 1,
	`Bass mute envelope: on (1) at 0, muted (0) from 3 s, square (${muteEnv?.map((p) => `${p.value}@${p.at} s${p.shape}`).join(", ") ?? "none"})`,
);
const recvEnv = recv?.volumeEnvelope;
check(
	recvEnv?.length === 2 &&
		near(recvEnv[0]!.value, 0.5) &&
		near(recvEnv[1]!.at, 2) &&
		near(recvEnv[1]!.value, 1),
	`Drums' receive from Bass has its volume envelope: 0.5 at 0, 1 at 2 s (${recvEnv?.map((p) => `${p.value.toFixed(2)}@${p.at}`).join(", ") ?? "none"})`,
);
check(
	got.masterVolumeEnvelope?.length === 3 && near(got.masterVolumeEnvelope[2]!.value, 0),
	`master volume envelope: three points, 0 at 6.01 s (${got.masterVolumeEnvelope?.map((p) => `${p.value.toFixed(2)}@${p.at}`).join(", ") ?? "none"})`,
);
const bassEnv = byName.get("Bass")?.panEnvelope;
check(bassEnv?.length === 1, `Bass has a pan envelope with one point (${bassEnv?.length ?? 0})`);
// The point is written as -0.6 for a pan of +0.6 (right): Reaper's pan envelope runs the other way up from its
// knob, and the pan the track shows in read mode is the envelope's, which must come out as Dawn's +0.6.
check(
	near(bassEnv?.[0]?.value, -0.6),
	`Bass pan envelope point stored as -0.6 for a pan of 0.6 (${bassEnv?.[0]?.value.toFixed(3)})`,
);
// Reaper's own render of the Bass track with that envelope driving its pan: the right channel louder means +0.6.
if (got.render && existsSync(got.render)) {
	const wav = readWav(got.render);
	const rms = (ch: Float32Array) => Math.sqrt(ch.reduce((s, v) => s + v * v, 0) / ch.length);
	const left = rms(wav.channels[0]!);
	const right = rms(wav.channels[1] ?? wav.channels[0]!);
	check(
		wav.channels.length === 2 && right > left * 1.5,
		`Reaper renders the Bass with the envelope's pan to the right: right ${right.toFixed(4)} RMS over left ${left.toFixed(4)}`,
	);
} else
	check(false, `Reaper rendered the Bass track for the pan check (${got.render ?? "no render"})`);
for (const c of arrangement.clips) {
	const track = arrangement.tracks.find((t) => t.id === c.trackId)!;
	const g = byName.get(track.name)?.items.find((i) => near(i.position, c.start, 0.01));
	check(
		g && near(g.length, c.duration, 0.01),
		`${c.name}: at ${c.start} s, ${c.duration} s long (${g ? `${g.position.toFixed(3)}, ${g.length.toFixed(3)}` : "missing"})`,
	);
	if (!g) continue;
	if (c.notes) {
		const origin = c.start - c.offset;
		const want = c.notes.map((n) => ({ at: origin + n.t, pitch: n.p }));
		const ok =
			g.notes?.length === want.length &&
			want.every((w) => g.notes!.some((n) => near(n.at, w.at, 0.01) && n.pitch === w.pitch));
		check(
			ok,
			`${c.name}: ${want.length} notes at their seconds through the tempo change (${g.notes?.map((n) => `${n.pitch}@${n.at.toFixed(2)}`).join(" ") ?? "none"})`,
		);
		const last = g.notes?.find((n) => n.pitch === 71);
		check(
			last && near(last.ends - last.at, 0.5, 0.01),
			`${c.name}: the last note half a second long at 100 bpm (${last ? (last.ends - last.at).toFixed(3) : "missing"})`,
		);
	} else {
		check(
			near(g.offset, c.offset) &&
				near(g.volume, c.gain) &&
				near(g.fadeIn, c.fadeIn) &&
				near(g.fadeOut, c.fadeOut),
			`${c.name}: offset ${c.offset}, gain ${c.gain}, fades ${c.fadeIn}/${c.fadeOut} (${g.offset?.toFixed(3)}, ${g.volume.toFixed(3)}, ${g.fadeIn.toFixed(3)}/${g.fadeOut.toFixed(3)})`,
		);
		check(!!g.file && existsSync(g.file), `${c.name}: its media found (${g.file ?? "none"})`);
	}
}
const tempos = [
	{ at: 0, bpm: arrangement.bpm, numerator: arrangement.beatsPerBar },
	...(arrangement.tempoChanges ?? []).map((t) => ({ at: t.start, bpm: t.bpm, numerator: 3 })),
];
for (const t of tempos) {
	const hit = got.tempos.find((g) => near(g.at, t.at, 0.01));
	check(
		hit && near(hit.bpm, t.bpm, 0.01) && hit.numerator === t.numerator && hit.denominator === 4,
		`tempo ${t.bpm} in ${t.numerator}/4 at ${t.at} s (${hit ? `${hit.bpm} in ${hit.numerator}/${hit.denominator} at ${hit.at.toFixed(3)}` : "missing"})`,
	);
}
for (const m of arrangement.markers ?? []) {
	const hit = got.markers.find((g) => g.name === m.name);
	check(
		hit && near(hit.at, m.t, 0.01) && !hit.region,
		`marker "${m.name}" at ${m.t} s (${hit ? hit.at.toFixed(3) : "missing"})`,
	);
}
check(near(got.sampleRate, 48000), `project sample rate 48000 (${got.sampleRate})`);
// Reaper's own render of the whole mix from 5 to 7 s: the master volume envelope, 0 from 6 s, leaves the second half silent.
if (got.mixRender && existsSync(got.mixRender)) {
	const wav = readWav(got.mixRender);
	const ch = wav.channels[0]!;
	// The first 40 % against the last 40 %: the ramp and the decay of the hit just after 6 s stay out of both.
	const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
	const first = rms(ch.subarray(0, Math.floor(ch.length * 0.4)));
	const second = rms(ch.subarray(Math.floor(ch.length * 0.6)));
	check(
		first > 0.001 && second < first / 100,
		`Reaper renders the mix silenced by the master volume envelope from 6 s: ${first.toFixed(4)} RMS then ${second.toFixed(6)}`,
	);
} else
	check(
		false,
		`Reaper rendered the mix for the master volume check (${got.mixRender ?? "no render"})`,
	);
check(
	near(got.masterVolume, arrangement.master),
	`master volume ${arrangement.master} (${got.masterVolume.toFixed(3)})`,
);
check(
	got.notes.includes("Key: A minor") && got.notes.includes("Key from 8 s: C major"),
	`the key in the project notes (${JSON.stringify(got.notes)})`,
);
if (got.log.length) console.log("Reaper said:", got.log.join(" | "));

// ── Reaper's own saving of it, back through the reader ──
const saved = `${out}/reaper-saved.RPP`;
check(existsSync(saved), `Reaper saved the project again (${saved})`);
if (existsSync(saved)) {
	const read = readRpp(readFileSync(saved, "utf8"), title);
	const b = read.arrangement;
	check(
		b.tracks.map((t) => t.name).join(", ") === "Bass, Keys, Piano part, Kick, Hats" &&
			b.buses?.map((x) => x.name).join() === "Drums",
		`read back: the five tracks and the Drums bus (${b.tracks.map((t) => t.name).join(", ")}; ${b.buses?.map((x) => x.name).join(", ") ?? "no bus"})`,
	);
	const bass = b.tracks.find((t) => t.name === "Bass");
	check(
		near(bass?.pan, -0.3) && near(bass?.gain, 0.8),
		`read back: Bass pan -0.3, volume 0.8 (${bass?.pan}, ${bass?.gain})`,
	);
	check(
		bass?.sends?.length === 1 && near(bass.sends[0]!.level, 0.5) && bass.sends[0]!.pre === true,
		`read back: Bass sends to Drums at 0.5, pre-fader (${JSON.stringify(bass?.sends)})`,
	);
	check(
		near(bass?.automation?.pan?.[0]?.v, 0.6),
		`read back: Bass pan lane 0.6 (${bass?.automation?.pan?.[0]?.v})`,
	);
	check(
		bass?.automation?.mute?.length === 2 &&
			bass.automation.mute[1]!.v === 1 &&
			near(bass.automation.mute[1]!.t, 3),
		`read back: Bass mute lane muted from 3 s (${JSON.stringify(bass?.automation?.mute)})`,
	);
	const sendLane = bass?.automation?.[`send:${b.buses?.[0]?.id}`];
	check(
		sendLane?.length === 2 && near(sendLane[1]!.v, 1) && near(sendLane[1]!.t, 2),
		`read back: Bass send lane to Drums 0.5 → 1 at 2 s (${JSON.stringify(sendLane)})`,
	);
	check(
		b.masterAutomation?.volume?.length === 3 && near(b.masterAutomation.volume[2]!.v, 0),
		`read back: the master volume lane (${JSON.stringify(b.masterAutomation)})`,
	);
	check(
		b.tracks
			.filter((t) => t.output === b.buses?.[0]?.id)
			.map((t) => t.name)
			.join() === "Kick,Hats",
		"read back: Kick and Hats go to Drums",
	);
	for (const c of arrangement.clips) {
		const r = b.clips.find((x) => x.name === c.name);
		check(
			r && near(r.start, c.start) && near(r.duration, c.duration, 0.01) && near(r.offset, c.offset),
			`read back: ${c.name} at ${c.start} s, ${c.duration} s, offset ${c.offset} (${r ? `${r.start}, ${r.duration}, ${r.offset}` : "missing"})`,
		);
		if (c.notes && r?.notes)
			check(
				r.notes.length === c.notes.length &&
					c.notes.every((n) =>
						r.notes!.some((m) => near(m.t, n.t, 0.01) && m.p === n.p && near(m.d, n.d, 0.01)),
					),
				`read back: ${c.name}'s ${c.notes.length} notes at their times (${r.notes.map((n) => `${n.p}@${n.t.toFixed(2)}`).join(" ")})`,
			);
	}
	check(
		JSON.stringify(b.tempoChanges) === JSON.stringify(arrangement.tempoChanges) &&
			JSON.stringify(b.meterChanges) === JSON.stringify(arrangement.meterChanges),
		`read back: the tempo and meter changes (${JSON.stringify(b.tempoChanges)} ${JSON.stringify(b.meterChanges)})`,
	);
	check(
		b.markers?.map((m) => `${m.name}@${m.t}`).join() === "Intro@0,Verse@8,Bridge@12.5",
		`read back: the markers (${b.markers?.map((m) => `${m.name}@${m.t}`).join()})`,
	);
	check(b.sampleRate === 48000, `read back: 48 kHz (${b.sampleRate})`);
	if (read.dropped.length) console.log("read back dropped:", read.dropped.join("; "));
	if (read.fixed.length) console.log("read back normalized:", read.fixed.join("; "));
}
if (problems.length) fail(`${problems.length} check${problems.length === 1 ? "" : "s"} failed`);
console.log("Reaper reads Dawn's project as Dawn meant it, and Dawn reads Reaper's.");

function fail(msg: string): never {
	console.error(msg);
	process.exit(1);
}
