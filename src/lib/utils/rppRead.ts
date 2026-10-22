import {
	MAX_STUDIO_CLIPS,
	MAX_STUDIO_MARKERS,
	MAX_STUDIO_NOTES_PER_CLIP,
	MAX_STUDIO_TRACKS,
	STUDIO_FADER_MAX,
	STUDIO_SAMPLE_RATES,
} from "#lib/constants/studio.js";
import { MAX_AUTOMATION_POINTS } from "#lib/constants/studioAutomation.js";
import { MAX_SENDS, MAX_STUDIO_BUSES } from "#lib/constants/studioInserts.js";
import type {
	StudioAutomationPoint,
	StudioBus,
	StudioClip,
	StudioMarker,
	StudioNote,
	StudioSend,
	StudioTrack,
} from "#lib/val/StudioSchema.js";
import { nanoid } from "nanoid";
import type { DawprojectFile, DawprojectRead } from "./dawprojectRead";
import { readReport } from "./readReport";
import { nearestStemTint } from "./nearestStemTint";

/** A block of the project: `<NAME args…` to its `>`, holding lines (as tokens) and blocks in order. */
interface Block {
	name: string;
	args: string[];
	body: (string[] | Block)[];
}

/** A line's tokens: split on spaces, a quoted run ("…", '…' or `…`, as Reaper quotes) kept whole. */
function tokens(line: string): string[] {
	const out: string[] = [];
	const s = line.trim();
	let i = 0;
	while (i < s.length) {
		const ch = s[i]!;
		if (ch === " ") {
			i++;
			continue;
		}
		if (ch === '"' || ch === "'" || ch === "`") {
			const end = s.indexOf(ch, i + 1);
			out.push(s.slice(i + 1, end < 0 ? s.length : end));
			i = end < 0 ? s.length : end + 1;
			continue;
		}
		let j = i;
		while (j < s.length && s[j] !== " ") j++;
		out.push(s.slice(i, j));
		i = j;
	}
	return out;
}

/** The project's blocks: `<REAPER_PROJECT` at the root. A `|line` (the notes) comes through as ["|", text]. */
function parseRpp(text: string): Block {
	const root: Block = { name: "", args: [], body: [] };
	const stack = [root];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		const top = stack[stack.length - 1]!;
		if (line === ">") {
			if (stack.length > 1) stack.pop();
			continue;
		}
		if (line.startsWith("<")) {
			const t = tokens(line.slice(1));
			const block: Block = { name: t[0] ?? "", args: t.slice(1), body: [] };
			top.body.push(block);
			stack.push(block);
			continue;
		}
		if (line.startsWith("|")) {
			top.body.push(["|", raw.replace(/^\s*\|/, "")]);
			continue;
		}
		top.body.push(tokens(line));
	}
	const project = root.body.find(
		(b): b is Block => !Array.isArray(b) && b.name === "REAPER_PROJECT",
	);
	if (!project) throw new Error("Not a Reaper project: no <REAPER_PROJECT block");
	return project;
}

const isBlock = (b: string[] | Block): b is Block => !Array.isArray(b);
const lineOf = (b: Block, key: string): string[] | undefined =>
	b.body.find((x): x is string[] => Array.isArray(x) && x[0] === key);
const linesOf = (b: Block, key: string): string[][] =>
	b.body.filter((x): x is string[] => Array.isArray(x) && x[0] === key);
const blocksOf = (b: Block, name: string): Block[] =>
	b.body.filter((x): x is Block => isBlock(x) && x.name === name);
const numAt = (line: string[] | undefined, i: number, fallback: number): number => {
	const v = Number(line?.[i]);
	return Number.isFinite(v) ? v : fallback;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round4 = (v: number) => Math.round(v * 10000) / 10000;
const round2 = (v: number) => Math.round(v * 100) / 100;
const seconds = (v: number) => Math.round(v * 1_000_000) / 1_000_000;

/**
 * A Reaper project (`.rpp`, the text format Reaper saves; docs/dawproject-plan.md
 * roadmap step 3) read into Dawn's shape, the same result the DAWproject
 * reader gives (dawprojectRead.ts) so the converter and Dawn's import
 * take either: the tempo and meter with their changes (the tempo
 * envelope's points, in seconds), the markers (a region as a marker at
 * its start), the project notes, the sample rate, the master's volume; a
 * track per track with volume, pan, mute, solo, color (the nearest of
 * Dawn's tints) and its volume and pan envelopes; a folder track as a bus
 * its children route to, a track with receives and no items as a bus the
 * senders send to; each item's active take as a clip in seconds (position,
 * length, start offset, volume, fades) over its media file, or a MIDI
 * take's notes with their ticks taken through the tempo map (or the
 * take's own tempo when it ignores the project's). What has no place in
 * Dawn is reported (`dropped`: FX, other takes, a stretched take, items
 * on a folder, receives on a track with items, nested folders' routing);
 * what was read into Dawn's ways is too (`fixed`). The media are not in
 * the file: `files` names them by the paths the project holds, and the
 * caller finds them (utils/unpackProject.ts).
 */
export function readRpp(text: string, fallbackTitle = "Reaper project"): DawprojectRead {
	const project = parseRpp(text);
	const { dropped, fixed, drop, fix } = readReport();

	// ── Tempo map: the project's tempo and meter, then the tempo envelope's points, in seconds ──
	const tempoLine = lineOf(project, "TEMPO");
	let bpm = clamp(round2(numAt(tempoLine, 1, 120)), 30, 300);
	let beatsPerBar = clamp(Math.round(numAt(tempoLine, 2, 4)), 2, 7);
	const meterOf = (num: number, den: number, where: string) => {
		const n = clamp(Math.round(num), 2, 7);
		if (n !== num || den !== 4) fix(`Time signature ${num}/${den} ${where} read as ${n}/4`);
		return n;
	};
	if (tempoLine)
		beatsPerBar = meterOf(numAt(tempoLine, 2, 4), numAt(tempoLine, 3, 4), "at the start");
	else fix("No tempo: 120 bpm, 4/4 assumed");
	const steps: { start: number; bpm: number; beatsPerBar: number }[] = [
		{ start: 0, bpm, beatsPerBar },
	];
	const env = blocksOf(project, "TEMPOENVEX")[0];
	if (env) {
		const points = linesOf(env, "PT")
			.map((p) => ({
				start: numAt(p, 1, 0),
				bpm: clamp(round2(numAt(p, 2, bpm)), 30, 300),
				shape: numAt(p, 3, 1),
				// The time signature on the point counts only with the flag Reaper sets beside it, as Reaper reads it.
				sig: numAt(p, 6, 0) === 1 ? numAt(p, 4, 0) : 0,
			}))
			.sort((a, b) => a.start - b.start);
		for (const p of points) {
			if (p.shape === 0 && p.start > 0) fix("Tempo ramps read as steps");
			const last = steps[steps.length - 1]!;
			// The time signature rides on the point as (denominator << 16) | numerator; 0 keeps the current one.
			const meter = p.sig
				? meterOf(p.sig & 0xffff, p.sig >> 16, `at ${seconds(p.start)} s`)
				: last.beatsPerBar;
			if (p.start <= 0) {
				steps[0] = { start: 0, bpm: p.bpm, beatsPerBar: meter };
				bpm = p.bpm;
				beatsPerBar = meter;
			} else if (p.start === last.start)
				steps[steps.length - 1] = { ...last, bpm: p.bpm, beatsPerBar: meter };
			else steps.push({ start: seconds(p.start), bpm: p.bpm, beatsPerBar: meter });
		}
	}
	const beatsAt = (s: number): number => {
		let beats = 0;
		for (let i = 0; i < steps.length; i++) {
			const step = steps[i]!;
			const next = steps[i + 1];
			const end = next && next.start < s ? next.start : s;
			if (end > step.start) beats += ((end - step.start) * step.bpm) / 60;
			if (!next || next.start >= s) break;
		}
		return beats;
	};
	const secondsAt = (beats: number): number => {
		let s = 0;
		let b = 0;
		for (let i = 0; i < steps.length; i++) {
			const step = steps[i]!;
			const next = steps[i + 1];
			const stepBeats = next ? ((next.start - step.start) * step.bpm) / 60 : Infinity;
			if (!next || b + stepBeats >= beats) return s + ((beats - b) * 60) / step.bpm;
			s = next.start;
			b += stepBeats;
		}
		return s;
	};
	const tempoChanges = steps
		.slice(1)
		.filter((s, i, all) => s.bpm !== (i === 0 ? steps[0]! : all[i - 1]!).bpm)
		.map((s) => ({ start: s.start, bpm: s.bpm }))
		.slice(0, 64);
	const meterChanges = steps
		.slice(1)
		.filter((s, i, all) => s.beatsPerBar !== (i === 0 ? steps[0]! : all[i - 1]!).beatsPerBar)
		.map((s) => ({ start: s.start, beatsPerBar: s.beatsPerBar }))
		.slice(0, 64);

	// ── Markers (a region's start carries its name; its end line is skipped), the notes, the rate, the master ──
	const markers: StudioMarker[] = [];
	for (const m of linesOf(project, "MARKER")) {
		const region = (numAt(m, 4, 0) & 1) === 1;
		const name = (m[3] ?? "").trim().slice(0, 40);
		if (region && !name) continue;
		if (region) fix("Regions read as markers at their start");
		if (markers.length >= MAX_STUDIO_MARKERS) {
			drop(`${name || "A marker"} (over the ${MAX_STUDIO_MARKERS}-marker limit)`);
			continue;
		}
		markers.push({ id: nanoid(), t: seconds(Math.max(0, numAt(m, 2, 0))), name: name || "Marker" });
	}
	const notesBlock = blocksOf(project, "NOTES")[0];
	const notes = notesBlock
		? notesBlock.body
				.filter((l): l is string[] => Array.isArray(l) && l[0] === "|")
				.map((l) => l[1] ?? "")
				.join("\n")
				.trim()
		: "";
	const rate = numAt(lineOf(project, "SAMPLERATE"), 1, 0);
	const sampleRate = (STUDIO_SAMPLE_RATES as readonly number[]).includes(rate)
		? (rate as (typeof STUDIO_SAMPLE_RATES)[number])
		: undefined;
	if (rate && !sampleRate)
		fix(`Sample rate ${rate} Hz is not one Dawn renders at: the default stands`);
	const master = clamp(round4(numAt(lineOf(project, "MASTER_VOLUME"), 1, 1)), 0, 1);
	const title = (lineOf(project, "TITLE")?.[1] ?? "").trim() || fallbackTitle;

	// ── Tracks: folders as buses, receives as sends, items as clips ──
	const trackBlocks = blocksOf(project, "TRACK");
	type Parsed = {
		block: Block;
		name: string;
		folderDepth: number;
		receives: { from: number; level: number; pre: boolean }[];
		hasItems: boolean;
		index: number;
	};
	const parsed: Parsed[] = trackBlocks.map((block, index) => {
		const bus = lineOf(block, "ISBUS");
		const kind = numAt(bus, 1, 0);
		return {
			block,
			name: (lineOf(block, "NAME")?.[1] ?? "").trim().slice(0, 60) || `Track ${index + 1}`,
			folderDepth: kind === 1 ? 1 : kind === 2 ? numAt(bus, 2, -1) : 0,
			receives: linesOf(block, "AUXRECV").map((r) => ({
				from: numAt(r, 1, -1),
				level: clamp(round4(numAt(r, 3, 1)), 0, 1),
				pre: numAt(r, 2, 0) !== 0,
			})),
			hasItems: blocksOf(block, "ITEM").length > 0,
			index,
		};
	});
	// Who is in which folder: a folder opens with ISBUS 1, the last child closes with ISBUS 2 -n.
	const parentOf = new Map<number, number>();
	const open: number[] = [];
	for (const p of parsed) {
		if (open.length) parentOf.set(p.index, open[open.length - 1]!);
		if (p.folderDepth === 1) open.push(p.index);
		else if (p.folderDepth < 0) for (let n = p.folderDepth; n < 0 && open.length; n++) open.pop();
	}
	const isFolder = (p: Parsed) => p.folderDepth === 1;
	const isBus = (p: Parsed) => isFolder(p) || (p.receives.length > 0 && !p.hasItems);
	const tracks: StudioTrack[] = [];
	const buses: StudioBus[] = [];
	const idOf = new Map<number, string>();
	const colourOf = (block: Block) => {
		const v = numAt(lineOf(block, "PEAKCOL"), 1, 0);
		if (!(v & 0x1000000)) return undefined;
		const tint = nearestStemTint(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff);
		if (!tint) fix("Track colors outside Dawn's palette, left uncolored");
		else fix("Track colors read as the nearest of Dawn's tints");
		return tint;
	};
	const laneOf = (
		block: Block,
		name: string,
		pan: boolean,
	): StudioAutomationPoint[] | undefined => {
		const envBlock = blocksOf(block, name)[0];
		if (!envBlock) return undefined;
		const pts = linesOf(envBlock, "PT")
			.map((p) => ({
				t: seconds(Math.max(0, numAt(p, 1, 0))),
				// Reaper keeps a pan envelope the other way up from its pan knob: +1 is left.
				v: pan
					? clamp(round4(-numAt(p, 2, 0)), -1, 1)
					: clamp(round4(numAt(p, 2, 1)), 0, STUDIO_FADER_MAX),
			}))
			.sort((a, b) => a.t - b.t)
			.slice(0, MAX_AUTOMATION_POINTS);
		if (pts.some((_, i) => i > 0 && numAt(linesOf(envBlock, "PT")[i], 3, 0) !== 0))
			fix("Envelope shapes other than linear read as linear");
		return pts.length ? pts : undefined;
	};
	const automationOf = (block: Block) => {
		const volume = laneOf(block, "VOLENV2", false);
		const pan = laneOf(block, "PANENV2", true);
		if (blocksOf(block, "VOLENV").length) drop("Pre-FX volume envelopes");
		if (blocksOf(block, "MUTEENV").length || blocksOf(block, "WIDTHENV2").length)
			drop("Mute and width envelopes");
		return volume || pan ? { ...(volume ? { volume } : {}), ...(pan ? { pan } : {}) } : undefined;
	};
	for (const p of parsed) {
		const block = p.block;
		const volpan = lineOf(block, "VOLPAN");
		const muteSolo = lineOf(block, "MUTESOLO");
		const colour = colourOf(block);
		const common = {
			name: p.name,
			...(colour ? { colour } : {}),
			gain: clamp(round4(numAt(volpan, 1, 1)), 0, STUDIO_FADER_MAX),
			pan: clamp(round4(numAt(volpan, 2, 0)), -1, 1),
			muted: numAt(muteSolo, 1, 0) !== 0,
			automation: automationOf(block),
		};
		if (blocksOf(block, "FXCHAIN").some((f) => f.body.some((x) => isBlock(x))))
			drop(`FX on ${p.name}`);
		if (isBus(p)) {
			if (buses.length >= MAX_STUDIO_BUSES) {
				drop(`${p.name} (over the ${MAX_STUDIO_BUSES}-bus limit)`);
				continue;
			}
			const id = nanoid();
			idOf.set(p.index, id);
			buses.push({ id, ...common });
			if (p.hasItems) drop(`Items on the folder ${p.name}`);
			if (parentOf.has(p.index)) {
				const parent = parsed[parentOf.get(p.index)!]!;
				drop(`${p.name} inside the folder ${parent.name}: goes to the master here`);
			}
		} else {
			if (tracks.length >= MAX_STUDIO_TRACKS) {
				drop(`${p.name} (over the ${MAX_STUDIO_TRACKS}-track limit)`);
				continue;
			}
			const id = nanoid();
			idOf.set(p.index, id);
			if (p.receives.length) drop(`Receives on ${p.name} (a track with items)`);
			tracks.push({
				id,
				...common,
				solo: numAt(muteSolo, 2, 0) !== 0,
				armed: false,
				input: null,
			});
		}
	}
	// Routing: a folder's children go to it; a bus's receives are sends from their source tracks.
	for (const p of parsed) {
		const id = idOf.get(p.index);
		const track = tracks.find((t) => t.id === id);
		if (!track) continue;
		const parent = parentOf.get(p.index);
		const busId = parent !== undefined ? idOf.get(parent) : undefined;
		if (busId && buses.some((b) => b.id === busId)) track.output = busId;
		const mainSend = lineOf(p.block, "MAINSEND");
		if (mainSend && numAt(mainSend, 1, 1) === 0 && !track.output)
			fix(`${p.name} sends to no output in Reaper: goes to the master here`);
	}
	for (const p of parsed) {
		const bus = buses.find((b) => b.id === idOf.get(p.index));
		if (!bus) continue;
		for (const r of p.receives) {
			const from = parsed[r.from];
			const track = from ? tracks.find((t) => t.id === idOf.get(from.index)) : undefined;
			if (!track) {
				if (from) drop(`A receive on ${p.name} from ${from.name} (not a track here)`);
				continue;
			}
			const sends: StudioSend[] = track.sends ?? [];
			if (sends.some((s) => s.bus === bus.id) || sends.length >= MAX_SENDS) continue;
			sends.push({ bus: bus.id, level: r.level, ...(r.pre ? { pre: true } : {}) });
			track.sends = sends;
		}
	}

	// ── Items: the active take of each as a clip ──
	const clips: StudioClip[] = [];
	const files: DawprojectFile[] = [];
	const sourceByPath = new Map<string, string>();
	for (const p of parsed) {
		const trackId = idOf.get(p.index);
		const track = tracks.find((t) => t.id === trackId);
		if (!track) continue;
		for (const item of blocksOf(p.block, "ITEM")) {
			// The item's own lines come first; each TAKE line starts another take, with its own name, offset, rate and source.
			const takes: (string[] | Block)[][] = [[]];
			const selected: number[] = [];
			for (const x of item.body) {
				if (Array.isArray(x) && x[0] === "TAKE") {
					takes.push([]);
					if (x.includes("SEL")) selected.push(takes.length - 1);
					continue;
				}
				takes[takes.length - 1]!.push(x);
			}
			const own: Block = { name: "ITEM", args: [], body: takes[0]! };
			const takeAt = selected[0] ?? 0;
			// The chosen take's lines first, so its name, offset, rate and source win over the first take's.
			const take: Block = {
				name: "TAKE",
				args: [],
				body: takeAt ? [...takes[takeAt]!, ...takes[0]!] : takes[0]!,
			};
			const name = (lineOf(take, "NAME")?.[1] ?? "").trim().slice(0, 60) || "Clip";
			if (takes.length > 1)
				drop(
					`${name} on ${p.name}: ${takes.length - 1} other ${takes.length === 2 ? "take" : "takes"}`,
				);
			if (numAt(lineOf(own, "MUTE"), 1, 0) !== 0) {
				drop(`${name} on ${p.name}: muted`);
				continue;
			}
			if (clips.length >= MAX_STUDIO_CLIPS) {
				drop(`${name} (over the ${MAX_STUDIO_CLIPS}-clip limit)`);
				continue;
			}
			const start = seconds(Math.max(0, numAt(lineOf(own, "POSITION"), 1, 0)));
			const duration = seconds(numAt(lineOf(own, "LENGTH"), 1, 0));
			if (duration <= 0) {
				drop(`${name} on ${p.name}: no length`);
				continue;
			}
			const offset = seconds(Math.max(0, numAt(lineOf(take, "SOFFS"), 1, 0)));
			const gain = clamp(round4(numAt(lineOf(take, "VOLPAN"), 1, 1)), 0, 2);
			const fadeIn = lineOf(own, "FADEIN");
			const fadeOut = lineOf(own, "FADEOUT");
			const shaped = numAt(fadeIn, 1, 1) !== 1 || numAt(fadeOut, 1, 1) !== 1;
			const playrate = numAt(lineOf(take, "PLAYRATE"), 1, 1);
			const base = {
				id: nanoid(),
				trackId: track.id,
				start,
				offset,
				duration,
				gain,
				fadeIn: clamp(seconds(numAt(fadeIn, 2, 0)), 0, 60),
				fadeOut: clamp(seconds(numAt(fadeOut, 2, 0)), 0, 60),
				name,
				...(shaped ? { fadeShape: "power" as const } : {}),
			};
			if (shaped) fix("Fade shapes other than linear read as equal power");
			// The source: a media file (wrapped in a SECTION when the take plays a part of it), or MIDI.
			let source = blocksOf(take, "SOURCE")[0];
			let sectionStart = 0;
			let sectionLength = 0;
			if (source?.args[0] === "SECTION") {
				sectionStart = numAt(lineOf(source, "STARTPOS"), 1, 0);
				sectionLength = numAt(lineOf(source, "LENGTH"), 1, 0);
				source = blocksOf(source, "SOURCE")[0];
			}
			// An item longer than its section with LOOP on repeats the section: Dawn's loop over that stretch of the file.
			const loopsSection =
				sectionLength > 0 &&
				numAt(lineOf(own, "LOOP"), 1, 1) === 1 &&
				duration > sectionLength - offset + 0.001;
			if (!source) {
				drop(`${name} on ${p.name}: no source`);
				continue;
			}
			if (source.args[0] === "MIDI") {
				const notes = midiNotes(source, start - offset, offset + duration, {
					beatsAt,
					secondsAt,
				});
				if (!notes.length) {
					drop(`${name} on ${p.name}: no notes`);
					continue;
				}
				if (notes.length > MAX_STUDIO_NOTES_PER_CLIP) {
					drop(`${name} on ${p.name}: over the ${MAX_STUDIO_NOTES_PER_CLIP}-note limit`);
					continue;
				}
				clips.push({ ...base, notes });
				if (track.kind !== "midi") {
					if (clips.some((c) => c.trackId === track.id && c.sourceId)) {
						drop(`${name} on ${p.name}: MIDI on a track with audio`);
						clips.pop();
						continue;
					}
					track.kind = "midi";
					track.input = { source: "piano", channel: "stereo" };
				}
				continue;
			}
			if (track.kind === "midi") {
				drop(`${name} on ${p.name}: audio on a MIDI track`);
				continue;
			}
			const path = lineOf(source, "FILE")?.[1];
			if (!path) {
				drop(`${name} on ${p.name}: no file`);
				continue;
			}
			if (source.args[0] === "RPP_PROJECT" || source.args[0] === "VIDEO") {
				drop(`${name} on ${p.name}: a ${source.args[0] === "VIDEO" ? "video" : "subproject"}`);
				continue;
			}
			if (Math.abs(playrate - 1) > 0.0001)
				drop(`${name} on ${p.name}: stretched (plays at the file's own speed here)`);
			let sourceId = sourceByPath.get(path);
			if (!sourceId) {
				sourceId = nanoid();
				sourceByPath.set(path, sourceId);
				files.push({ sourceId, path, label: `${p.name} - ${name}` });
			}
			const sectionFrom = Math.max(0, sectionStart);
			clips.push({
				...base,
				offset: seconds(sectionFrom + (loopsSection ? offset % sectionLength : offset)),
				sourceId,
				...(loopsSection
					? { loop: { start: seconds(sectionFrom), end: seconds(sectionFrom + sectionLength) } }
					: {}),
			});
		}
	}
	if (blocksOf(project, "MASTERFXLIST").some((f) => f.body.some((x) => isBlock(x))))
		drop("FX on the master");

	return {
		title,
		notes,
		arrangement: {
			version: 1,
			bpm,
			beatsPerBar,
			gridOn: true,
			countIn: false,
			click: false,
			loop: null,
			master,
			tracks,
			clips,
			...(sampleRate ? { sampleRate } : {}),
			...(buses.length ? { buses } : {}),
			...(markers.length ? { markers } : {}),
			...(tempoChanges.length ? { tempoChanges } : {}),
			...(meterChanges.length ? { meterChanges } : {}),
		},
		files,
		dropped,
		fixed,
	};
}

/**
 * A MIDI take's notes in seconds from the clip's content origin: the
 * events' ticks (quarter notes at the take's PPQ, each `E`/`e` line and
 * each `<X` block advancing the clock) are taken through the project's
 * tempo map from the take's origin, or through the take's own tempo when
 * it ignores the project's (IGNTEMPO 1). Note-ons with velocity, their
 * note-offs (or an on at velocity zero) closing them; muted events skipped.
 */
function midiNotes(
	source: Block,
	origin: number,
	/** Where the clip ends in its content's seconds: a note still open at the last event closes there. */
	end: number,
	map: { beatsAt: (s: number) => number; secondsAt: (b: number) => number },
): StudioNote[] {
	const ppq = Math.max(1, numAt(lineOf(source, "HASDATA"), 2, 960));
	const ign = lineOf(source, "IGNTEMPO");
	const ownTempo = ign && numAt(ign, 1, 0) === 1 ? numAt(ign, 2, 120) : null;
	const originBeats = map.beatsAt(Math.max(0, origin));
	const at = (ticks: number): number => {
		const beats = ticks / ppq;
		if (ownTempo) return (beats * 60) / ownTempo;
		return map.secondsAt(originBeats + beats) - Math.max(0, origin);
	};
	const notes: StudioNote[] = [];
	const open = new Map<number, { t: number; v: number }>();
	let ticks = 0;
	const close = (pitch: number, now: number) => {
		const o = open.get(pitch);
		if (!o) return;
		open.delete(pitch);
		const d = now - o.t;
		if (d > 0) notes.push({ t: seconds(o.t), d: seconds(Math.max(0.001, d)), p: pitch, v: o.v });
	};
	for (const x of source.body) {
		if (isBlock(x)) {
			if (x.name === "X" || x.name === "x") ticks += numAt(x.args, 0, 0);
			continue;
		}
		const key = x[0] ?? "";
		if (!/^[Ee]m?$/.test(key)) continue;
		ticks += numAt(x, 1, 0);
		if (key.endsWith("m")) continue;
		const status = parseInt(x[2] ?? "", 16);
		const d1 = parseInt(x[3] ?? "", 16);
		const d2 = parseInt(x[4] ?? "", 16);
		if (!Number.isFinite(status) || !Number.isFinite(d1)) continue;
		const kind = status & 0xf0;
		const now = at(ticks);
		if (kind === 0x90 && d2 > 0) {
			close(d1, now);
			open.set(d1, { t: now, v: clamp(round4(d2 / 127), 0, 1) });
		} else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) close(d1, now);
	}
	for (const pitch of open.keys())
		close(pitch, Math.max(at(ticks), end, open.get(pitch)!.t + 0.001));
	return notes.sort((a, b) => a.t - b.t || a.p - b.p);
}
