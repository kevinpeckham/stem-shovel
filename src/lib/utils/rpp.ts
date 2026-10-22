import { stemTintHex } from "#lib/constants/stemTints.js";
import type { StudioArrangement, StudioClip } from "#lib/val/StudioSchema.js";
import { beatsBetween } from "#lib/audio/measures.js";
import { clipNoteEvents } from "./clipNoteEvents";
import { clipSegments } from "./clipSegments";
import { studioGrid } from "./studioGrid";

/** An audio file the project refers to for a clip's source: its path beside the `.rpp` file. */
export interface RppAudio {
	path: string;
	durationSeconds: number;
	sampleRate: number;
	channels: number;
}

export interface RppProjectInput {
	title: string;
	arrangement: StudioArrangement;
	/** By source id: the audio written beside the project (a clip whose source is missing is left out). */
	audio: Map<string, RppAudio>;
	application: { name: string; version: string };
}

/** The ticks a MIDI take counts a quarter note in. */
const PPQ = 960;

/**
 * A song as a Reaper project (`.rpp`, Reaper's own text format;
 * docs/dawproject-plan.md roadmap step 3): the sample rate, the tempo and
 * meter with the changes as the tempo envelope's points (steps, the time
 * signature riding on each), the markers, the key and notes as the project
 * notes, the master's volume; a track per track with volume, pan, mute,
 * solo and color and its volume and pan envelopes (the pan one the other
 * way up, as Reaper keeps it); each bus a folder track its tracks sit in,
 * with a receive for each send to it; an item per clip in seconds
 * (position, length, start offset, volume, linear fades) over its media
 * file by a path relative to the project, or a MIDI item whose events
 * are the clip's notes in ticks through the tempo map, ending with all
 * notes off. Inserts stay out (Reaper's FX are its own plugins). Pure;
 * the caller writes the audio beside it. Reaper reads the result as
 * `bun run interop:rpp` checks (scripts/interop/rpp.ts).
 */
export function rppProject(input: RppProjectInput): string {
	const a = input.arrangement;
	const num = (v: number) =>
		Number.isFinite(v) ? String(Math.round(v * 1_000_000) / 1_000_000) : "0";
	const q = (s: string) => `"${s.replace(/["\r\n]/g, " ")}"`;
	const lines: string[] = [];
	const out = (depth: number, s: string) => lines.push(`${"  ".repeat(depth)}${s}`);
	const grid = studioGrid(a);

	out(
		0,
		`<REAPER_PROJECT 0.1 "7.0/${input.application.name.replace(/[^\w.-]+/g, "-")}-${input.application.version.replace(/[^\w.-]+/g, "-")}" ${Math.floor(Date.now() / 1000)} 0`,
	);
	// Project notes: the title, the key and its changes, so nothing of the song's words is lost.
	const notes = [`Title: ${input.title}`];
	if (a.key) notes.push(`Key: ${a.key}`);
	for (const k of [...(a.keyChanges ?? [])].sort((x, y) => x.start - y.start))
		notes.push(`Key from ${num(k.start)} s: ${k.key}`);
	out(1, "<NOTES 0 2");
	for (const n of notes) out(2, `|${n}`);
	out(1, ">");
	if (a.sampleRate) out(1, `SAMPLERATE ${a.sampleRate} 0 0`);
	out(1, `TEMPO ${num(a.bpm)} ${a.beatsPerBar} 4 0`);
	// The tempo map: every tempo and meter change as a held point, the time signature on each as (4 << 16) | beats.
	const changes = new Map<number, { bpm?: number; beatsPerBar?: number }>();
	for (const c of a.tempoChanges ?? [])
		if (c.start > 0) changes.set(c.start, { ...changes.get(c.start), bpm: c.bpm });
	for (const c of a.meterChanges ?? [])
		if (c.start > 0) changes.set(c.start, { ...changes.get(c.start), beatsPerBar: c.beatsPerBar });
	if (changes.size) {
		out(1, "<TEMPOENVEX");
		out(2, "ACT 1 -1");
		out(2, "VIS 1 0 1");
		out(2, "ARM 0");
		out(2, "DEFSHAPE 1 -1 -1");
		let bpm = a.bpm;
		let beatsPerBar = a.beatsPerBar;
		const sig = () => (4 << 16) | beatsPerBar;
		// Reaper takes the time signature on a point only with the flag after it (its own files carry "0 1").
		out(2, `PT 0 ${num(bpm)} 1 ${sig()} 0 1`);
		for (const [start, c] of [...changes].sort((x, y) => x[0] - y[0])) {
			if (c.bpm !== undefined) bpm = c.bpm;
			if (c.beatsPerBar !== undefined) beatsPerBar = c.beatsPerBar;
			out(2, `PT ${num(start)} ${num(bpm)} 1 ${sig()} 0 1`);
		}
		out(1, ">");
	}
	const markers = [...(a.markers ?? [])].sort((x, y) => x.t - y.t);
	markers.forEach((m, i) => out(1, `MARKER ${i + 1} ${num(m.t)} ${q(m.name)} 0 0 1`));
	out(1, `MASTER_VOLUME ${num(a.master)} 0 -1 -1 1`);

	// The order: tracks to the master, then each bus as a folder holding the tracks routed to it.
	type Row = { kind: "track"; id: string } | { kind: "bus"; id: string };
	const buses = a.buses ?? [];
	const rows: Row[] = [];
	for (const t of a.tracks)
		if (!t.output || !buses.some((b) => b.id === t.output)) rows.push({ kind: "track", id: t.id });
	for (const b of buses) {
		rows.push({ kind: "bus", id: b.id });
		for (const t of a.tracks) if (t.output === b.id) rows.push({ kind: "track", id: t.id });
	}
	const indexOf = new Map(rows.map((r, i) => [r.id, i]));
	const childrenOf = (busId: string) => a.tracks.filter((t) => t.output === busId);

	const envelope = (name: string, lane: { t: number; v: number }[], pan: boolean) => {
		if (!lane.length) return;
		out(2, `<${name}`);
		out(3, "ACT 1 -1");
		out(3, "VIS 1 1 1");
		out(3, "ARM 0");
		out(3, "DEFSHAPE 0 -1 -1");
		for (const p of lane) out(3, `PT ${num(p.t)} ${num(pan ? -p.v : p.v)} 0`);
		out(2, ">");
	};
	const colour = (id: string | undefined) => {
		const hex = stemTintHex(id);
		if (!hex) return;
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		out(2, `PEAKCOL ${0x1000000 | (b << 16) | (g << 8) | r}`);
	};
	const item = (c: StudioClip) => {
		const audio = c.sourceId ? input.audio.get(c.sourceId) : undefined;
		if (!c.notes && !audio) return;
		// A looped audio clip: Reaper loops an item over its source, so the loop becomes a SECTION of the file with LOOP 1 when the
		// clip starts inside it; a clip that plays into its loop from before it goes out as one item per pass instead.
		const loop = audio && c.loop;
		if (loop && (c.offset < loop.start || c.offset >= loop.end)) {
			for (const seg of clipSegments(c)) {
				const first = seg.start === c.start;
				const last = seg.start + seg.duration >= c.start + c.duration;
				item({
					...c,
					loop: undefined,
					start: seg.start,
					offset: seg.offset,
					duration: seg.duration,
					fadeIn: first ? c.fadeIn : 0,
					fadeOut: last ? c.fadeOut : 0,
				});
			}
			return;
		}
		out(2, "<ITEM");
		out(3, `POSITION ${num(c.start)}`);
		out(3, `LENGTH ${num(c.duration)}`);
		if (loop) out(3, "LOOP 1");
		out(3, `FADEIN 1 ${num(c.fadeIn)} 0 1 0 0 0`);
		out(3, `FADEOUT 1 ${num(c.fadeOut)} 0 1 0 0 0`);
		out(3, `MUTE ${c.muted ? 1 : 0} 0`);
		out(3, `NAME ${q(c.name)}`);
		out(3, `VOLPAN ${num(c.gain)} 0 1 -1`);
		if (c.notes) {
			out(3, "SOFFS 0 0");
			out(3, "PLAYRATE 1 1 0 -1 0 0.0025");
			out(3, "<SOURCE MIDI");
			out(4, `HASDATA 1 ${PPQ} QN`);
			// The notes as events in ticks from the item's start, through the tempo map; offs before ons at one tick.
			const ticks = (s: number) => Math.max(0, Math.round(beatsBetween(grid, c.start, s) * PPQ));
			const events: { tick: number; order: number; bytes: string }[] = [];
			const hex = (v: number) =>
				Math.max(0, Math.min(127, Math.round(v)))
					.toString(16)
					.padStart(2, "0");
			for (const e of clipNoteEvents(c)) {
				events.push({
					tick: ticks(e.at),
					order: 1,
					bytes: `90 ${hex(e.pitch)} ${hex(e.velocity * 127)}`,
				});
				events.push({ tick: ticks(e.at + e.duration), order: 0, bytes: `80 ${hex(e.pitch)} 00` });
			}
			const end = ticks(c.start + c.duration);
			events.push({ tick: end, order: 2, bytes: "b0 7b 00" });
			events.sort((x, y) => x.tick - y.tick || x.order - y.order);
			let at = 0;
			for (const e of events) {
				out(4, `E ${e.tick - at} ${e.bytes}`);
				at = e.tick;
			}
			out(4, "IGNTEMPO 0 120 4 4");
			out(3, ">");
		} else if (audio && loop) {
			out(3, `SOFFS ${num(c.offset - loop.start)}`);
			out(3, "PLAYRATE 1 1 0 -1 0 0.0025");
			out(3, "<SOURCE SECTION");
			out(4, `LENGTH ${num(loop.end - loop.start)}`);
			out(4, `STARTPOS ${num(loop.start)}`);
			out(4, "OVERLAP 0.01");
			out(4, "<SOURCE WAVE");
			out(5, `FILE ${q(audio.path)}`);
			out(4, ">");
			out(3, ">");
		} else if (audio) {
			out(3, `SOFFS ${num(c.offset)}`);
			out(3, "PLAYRATE 1 1 0 -1 0 0.0025");
			out(3, "<SOURCE WAVE");
			out(4, `FILE ${q(audio.path)}`);
			out(3, ">");
		}
		out(2, ">");
	};

	for (const row of rows) {
		const track = row.kind === "track" ? a.tracks.find((t) => t.id === row.id) : undefined;
		const bus = row.kind === "bus" ? buses.find((b) => b.id === row.id) : undefined;
		const strip = track ?? bus;
		if (!strip) continue;
		out(1, "<TRACK");
		out(2, `NAME ${q(strip.name)}`);
		colour(strip.colour);
		out(2, `VOLPAN ${num(strip.gain)} ${num(strip.pan)} -1 -1 1`);
		out(2, `MUTESOLO ${strip.muted ? 1 : 0} ${track?.solo ? 1 : 0} 0`);
		if (bus) out(2, `ISBUS ${childrenOf(bus.id).length ? "1 1" : "0 0"}`);
		else if (track?.output && buses.some((b) => b.id === track.output)) {
			const kids = childrenOf(track.output);
			out(2, `ISBUS ${kids[kids.length - 1]?.id === track.id ? "2 -1" : "0 0"}`);
		} else out(2, "ISBUS 0 0");
		out(2, "MAINSEND 1 0");
		if (bus)
			for (const t of a.tracks)
				for (const s of t.sends ?? [])
					if (s.bus === bus.id && indexOf.has(t.id))
						out(
							2,
							`AUXRECV ${indexOf.get(t.id)} ${s.pre ? 3 : 0} ${num(s.level)} 0 0 0 0 0 0 -1 0 -1 0`,
						);
		envelope("VOLENV2", strip.automation?.volume ?? [], false);
		envelope("PANENV2", strip.automation?.pan ?? [], true);
		if (track) for (const c of a.clips) if (c.trackId === track.id) item(c);
		out(1, ">");
	}
	out(0, ">");
	return lines.join("\n") + "\n";
}
