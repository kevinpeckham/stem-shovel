import { parseMidi, type MidiSummary } from "#lib/audio/midi.js";
import {
	MAX_STUDIO_CLIPS,
	MAX_STUDIO_MARKERS,
	MAX_STUDIO_NOTES_PER_CLIP,
	MAX_STUDIO_TRACKS,
} from "#lib/constants/studio.js";
import type { StudioClip, StudioMarker, StudioNote, StudioTrack } from "#lib/val/StudioSchema.js";
import { nanoid } from "nanoid";
import type { DawprojectRead } from "./dawprojectRead";
import { readReport } from "./readReport";
import { DRUM_CHANNEL } from "./midiNotesFile";

/** Times to a tenth of a millisecond, as Dawn keeps its clips: a tick through the tempo map lands a hair off a second otherwise. */
const seconds = (v: number) => Math.round(v * 10000) / 10000;
const round4 = seconds;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Major and minor keys by their signature, −7 flats to 7 sharps, as Dawn writes them. */
const MAJOR = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
const MINOR = [
	"Abm",
	"Ebm",
	"Bbm",
	"Fm",
	"Cm",
	"Gm",
	"Dm",
	"Am",
	"Em",
	"Bm",
	"F#m",
	"C#m",
	"G#m",
	"D#m",
	"A#m",
];

/**
 * A Standard MIDI File read into Dawn's shape, the same result the
 * DAWproject reader gives (dawprojectRead.ts), so the converter can turn
 * any MIDI file into a DAWproject or a Reaper project with its tempo map
 * intact (docs/dawproject-plan.md, roadmap step 5). A format 1 file's
 * tracks become MIDI tracks (one clip of their notes each, split at
 * Dawn's note limit; a track on channel 10 is a drums track), its
 * conductor's name the title; a format 0 file's channels become the
 * tracks. The tempo map, the meters, the key and its changes and the
 * markers come from the conductor's events, already in seconds through
 * the file's own tempos (audio/midi.ts). Controllers, pitch bend and
 * program changes are counted and reported; there is no audio.
 */
export function readMidi(
	bytes: ArrayBuffer | Uint8Array,
	fallbackTitle = "MIDI file",
): DawprojectRead {
	const buffer =
		bytes instanceof Uint8Array
			? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
			: bytes;
	const summary = parseMidi(buffer as ArrayBuffer);
	return fromSummary(summary, fallbackTitle);
}

function fromSummary(summary: MidiSummary, fallbackTitle: string): DawprojectRead {
	const { dropped, fixed, drop, fix } = readReport();

	// ── The conductor: tempo, meters, key, markers ──
	const tempos = (summary.tempos ?? []).map((t) => ({
		at: seconds(t.at),
		bpm: clamp(t.bpm, 30, 300),
	}));
	for (const t of summary.tempos ?? [])
		if (t.bpm < 30 || t.bpm > 300) fix(`Tempo ${t.bpm} read as ${clamp(t.bpm, 30, 300)}`);
	const bpm =
		tempos.find((t) => t.at === 0)?.bpm ?? (tempos.length ? undefined : 120) ?? tempos[0]!.bpm;
	if (!tempos.length) fix("No tempo in the file: 120 bpm assumed");
	const tempoChanges = tempos
		.filter((t) => t.at > 0)
		.filter((t, i, all) => i === all.length - 1 || all[i + 1]!.at !== t.at)
		.map((t) => ({ start: t.at, bpm: t.bpm }))
		.filter((c, i, all) => (i === 0 ? c.bpm !== bpm : c.bpm !== all[i - 1]!.bpm))
		.slice(0, 64);
	const meterOf = (m: { numerator: number; denominator: number }, where: string) => {
		const n = clamp(Math.round(m.numerator), 2, 7);
		if (n !== m.numerator || m.denominator !== 4)
			fix(`Time signature ${m.numerator}/${m.denominator} ${where} read as ${n}/4`);
		return n;
	};
	const meters = summary.meters ?? [];
	const first = meters.find((m) => m.at === 0) ?? meters[0];
	const beatsPerBar = first ? meterOf(first, "at the start") : 4;
	if (!first) fix("No time signature in the file: 4/4 assumed");
	const meterChanges = meters
		.filter((m) => m.at > 0)
		.map((m) => ({ start: seconds(m.at), beatsPerBar: meterOf(m, `at ${seconds(m.at)} s`) }))
		.filter((c, i, all) =>
			i === 0 ? c.beatsPerBar !== beatsPerBar : c.beatsPerBar !== all[i - 1]!.beatsPerBar,
		)
		.slice(0, 64);
	const keyName = (k: { sharps: number; minor: boolean }) =>
		(k.minor ? MINOR : MAJOR)[clamp(Math.round(k.sharps), -7, 7) + 7]!;
	const keys = summary.keys ?? [];
	const key = keys.length ? keyName(keys.find((k) => k.at === 0) ?? keys[0]!) : undefined;
	const keyChanges = keys
		.filter((k) => k.at > 0)
		.map((k) => ({ start: seconds(k.at), key: keyName(k) }))
		.filter((c, i, all) => (i === 0 ? c.key !== key : c.key !== all[i - 1]!.key))
		.slice(0, 64);
	const markers: StudioMarker[] = [];
	for (const m of summary.markers ?? []) {
		const name = m.name.trim().slice(0, 40) || "Marker";
		if (markers.length >= MAX_STUDIO_MARKERS) {
			drop(`${name} (over the ${MAX_STUDIO_MARKERS}-marker limit)`);
			continue;
		}
		markers.push({ id: nanoid(), t: seconds(Math.max(0, m.at)), name });
	}

	// ── The tracks: a format 1 file's tracks, a format 0 file's channels ──
	const byTrack = new Map<number, MidiSummary["notes"]>();
	for (const n of summary.notes) {
		const list = byTrack.get(n.track) ?? [];
		list.push(n);
		byTrack.set(n.track, list);
	}
	type Part = { name: string; notes: MidiSummary["notes"]; drums: boolean };
	const parts: Part[] = [];
	const nameAt = summary.trackNameAt ?? [];
	const trackCount = summary.trackCount ?? byTrack.size;
	const conductor = trackCount > 1 && !byTrack.has(0) ? nameAt[0]?.trim() : undefined;
	if (byTrack.size === 1 && trackCount <= 1) {
		// Format 0: one track for every channel; the channels become the parts.
		const only = byTrack.get([...byTrack.keys()][0]!)!;
		const channels = [...new Set(only.map((n) => n.channel))].sort((a, b) => a - b);
		for (const c of channels)
			parts.push({
				name:
					channels.length === 1
						? nameAt[0]?.trim() || fallbackTitle
						: c === DRUM_CHANNEL
							? "Drums"
							: `Channel ${c + 1}`,
				notes: only.filter((n) => n.channel === c),
				drums: c === DRUM_CHANNEL,
			});
	} else {
		for (let t = 0; t < Math.max(trackCount, ...byTrack.keys()) + 1; t++) {
			const notes = byTrack.get(t);
			if (!notes?.length) {
				if (t > 0 && nameAt[t]?.trim()) drop(`${nameAt[t]!.trim()}: a track with no notes`);
				continue;
			}
			parts.push({
				name: nameAt[t]?.trim() || `Track ${t + 1}`,
				notes,
				drums: notes.every((n) => n.channel === DRUM_CHANNEL),
			});
		}
	}

	const tracks: StudioTrack[] = [];
	const clips: StudioClip[] = [];
	for (const p of parts) {
		const name = p.name.slice(0, 60);
		if (tracks.length >= MAX_STUDIO_TRACKS) {
			drop(`${name} (over the ${MAX_STUDIO_TRACKS}-track limit)`);
			continue;
		}
		const track: StudioTrack = {
			id: nanoid(),
			kind: "midi",
			name,
			gain: 1,
			pan: 0,
			muted: false,
			solo: false,
			armed: false,
			input: { source: p.drums ? "drums" : "piano", channel: "stereo" },
		};
		tracks.push(track);
		// One clip of the notes from the first to the last; past the note limit, the rest in further clips.
		const sorted = [...p.notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
		for (let i = 0; i < sorted.length; i += MAX_STUDIO_NOTES_PER_CLIP) {
			const chunk = sorted.slice(i, i + MAX_STUDIO_NOTES_PER_CLIP);
			const start = seconds(chunk[0]!.start);
			const end = seconds(chunk.reduce((m, n) => Math.max(m, n.start + n.duration), start));
			if (clips.length >= MAX_STUDIO_CLIPS) {
				drop(`${name} (over the ${MAX_STUDIO_CLIPS}-clip limit)`);
				break;
			}
			const notes: StudioNote[] = chunk.map((n) => ({
				t: seconds(n.start - start),
				d: Math.max(0.001, seconds(n.duration)),
				p: clamp(Math.round(n.pitch), 0, 127),
				v: clamp(round4(n.velocity / 127), 0, 1),
			}));
			clips.push({
				id: nanoid(),
				trackId: track.id,
				notes,
				start,
				offset: 0,
				duration: Math.max(0.001, seconds(end - start)),
				gain: 1,
				fadeIn: 0,
				fadeOut: 0,
				name: i === 0 ? name : `${name} ${Math.floor(i / MAX_STUDIO_NOTES_PER_CLIP) + 1}`,
			});
		}
		if (sorted.length > MAX_STUDIO_NOTES_PER_CLIP)
			fix(`${name}: ${sorted.length} notes, in clips of ${MAX_STUDIO_NOTES_PER_CLIP}`);
	}
	if (!summary.notes.length) drop("No notes in the file");
	if (summary.otherEvents)
		drop(
			`${summary.otherEvents} controller, pitch-bend, pressure or program-change ${summary.otherEvents === 1 ? "event" : "events"}`,
		);

	return {
		title: (conductor || fallbackTitle).slice(0, 120),
		notes: "",
		arrangement: {
			version: 1,
			bpm,
			beatsPerBar,
			gridOn: true,
			countIn: false,
			click: false,
			loop: null,
			master: 1,
			tracks,
			clips,
			...(markers.length ? { markers } : {}),
			...(tempoChanges.length ? { tempoChanges } : {}),
			...(meterChanges.length ? { meterChanges } : {}),
			...(key ? { key } : {}),
			...(keyChanges.length ? { keyChanges } : {}),
		},
		files: [],
		dropped,
		fixed,
	};
}
