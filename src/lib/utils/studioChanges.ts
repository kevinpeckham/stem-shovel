import { BEAT_UNITS } from "../constants/studio";
import type { SongChange } from "../val/SongChangeSchema";
import type { BeatUnit } from "../val/StudioSchema";

/** What Dawn keeps of a song's timed changes (docs/multitrack-recorder.md, "Key, and the changes both ways"). */
export interface StudioChanges {
	bpm: number;
	beatsPerBar: number;
	beatUnit?: BeatUnit;
	tempoChanges?: { start: number; bpm: number }[];
	meterChanges?: { start: number; beatsPerBar: number; beatUnit?: BeatUnit }[];
	key?: string;
	keyChanges?: { start: number; key: string }[];
}

const clampBpm = (n: number) => Math.min(300, Math.max(30, Math.round(n * 10) / 10));
const beatsOf = (value: string): number | null => {
	const n = Number(value.split("/")[0]);
	return Number.isInteger(n) && n >= 2 && n <= 7 ? n : null;
};
/** The note a beat is from a time signature's bottom number; a quarter when it is none Dawn knows. */
const unitOf = (value: string): BeatUnit => {
	const d = Number(value.split("/")[1]);
	return (BEAT_UNITS as readonly number[]).includes(d) ? (d as BeatUnit) : 4;
};
/** The unit of a meter list in force at a second (the first from zero). */
const unitAt = (meters: SongChange[], start: number): BeatUnit =>
	unitOf(meters.findLast((m) => m.start <= start)?.value ?? meters[0]?.value ?? "4/4");

/**
 * A song's changes (tempo, key, time signature from a second each) as Dawn's
 * arrangement holds them: the first of each kind is the song's own value from
 * zero, the rest are changes on the ruler. A time signature's beats outside
 * 2–7 are left out, its bottom number kept when Dawn has it (2, 4, 8, 16);
 * a key is kept as written. The two count tempo differently (audio/measures.ts):
 * the stem player's beat is the bottom number (6/8 at 120 is 120 eighths a
 * minute), Dawn's tempo is quarter notes a minute as a DAW's, so a tempo
 * crosses in the meter in force where it starts (that 120 is Dawn's 60), then
 * clamped to Dawn's 30–300.
 */
export function songChangesToStudio(changes: SongChange[]): StudioChanges {
	const sorted = [...changes].sort((a, b) => a.start - b.start);
	const tempos = sorted.filter((c) => c.kind === "tempo" && Number.isFinite(Number(c.value)));
	const meters = sorted.filter((c) => c.kind === "meter" && beatsOf(c.value) !== null);
	const keys = sorted.filter((c) => c.kind === "key" && c.value.trim() !== "");
	const quarterBpm = (c: SongChange) => clampBpm((Number(c.value) * 4) / unitAt(meters, c.start));
	const unit = meters.length ? unitOf(meters[0]!.value) : 4;
	const out: StudioChanges = {
		bpm: tempos.length ? quarterBpm(tempos[0]!) : 120,
		beatsPerBar: meters.length ? beatsOf(meters[0]!.value)! : 4,
		...(unit !== 4 ? { beatUnit: unit } : {}),
	};
	const laterTempos = tempos.slice(1).filter((c) => c.start > 0);
	const laterMeters = meters.slice(1).filter((c) => c.start > 0);
	const laterKeys = keys.slice(1).filter((c) => c.start > 0);
	if (laterTempos.length)
		out.tempoChanges = laterTempos.map((c) => ({ start: c.start, bpm: quarterBpm(c) }));
	if (laterMeters.length)
		out.meterChanges = laterMeters.map((c) => ({
			start: c.start,
			beatsPerBar: beatsOf(c.value)!,
			...(unitOf(c.value) !== 4 ? { beatUnit: unitOf(c.value) } : {}),
		}));
	if (keys.length) out.key = keys[0]!.value.trim();
	if (laterKeys.length)
		out.keyChanges = laterKeys.map((c) => ({ start: c.start, key: c.value.trim() }));
	return out;
}

/**
 * The other way: Dawn's tempo, meter and key, with their changes, as a
 * song's changes for a song made from a Dawn song. The meter goes out with
 * its bottom number, and a tempo in the player's beats of that number
 * (Dawn's 60 in 6/8 is the player's 120), so both count the same bars.
 */
export function studioChangesToSong(a: StudioChanges): SongChange[] {
	const meters = [
		{ start: 0, unit: a.beatUnit ?? 4 },
		...(a.meterChanges ?? []).map((c) => ({ start: c.start, unit: c.beatUnit ?? 4 })),
	];
	const beatBpm = (bpm: number, start: number) => {
		const unit = meters.findLast((m) => m.start <= start)?.unit ?? 4;
		return String(Math.round(((bpm * unit) / 4) * 10) / 10);
	};
	const out: SongChange[] = [
		{ kind: "tempo", start: 0, value: beatBpm(a.bpm, 0) },
		{ kind: "meter", start: 0, value: `${a.beatsPerBar}/${a.beatUnit ?? 4}` },
	];
	if (a.key?.trim()) out.push({ kind: "key", start: 0, value: a.key.trim() });
	for (const c of a.tempoChanges ?? [])
		out.push({ kind: "tempo", start: c.start, value: beatBpm(c.bpm, c.start) });
	for (const c of a.meterChanges ?? [])
		out.push({ kind: "meter", start: c.start, value: `${c.beatsPerBar}/${c.beatUnit ?? 4}` });
	for (const c of a.keyChanges ?? []) out.push({ kind: "key", start: c.start, value: c.key });
	return out.sort((x, y) => x.start - y.start);
}

/** The key in force at a second: the song's own, or the last change at or before it; "" without one. */
export function studioKeyAt(a: Pick<StudioChanges, "key" | "keyChanges">, seconds: number): string {
	let key = a.key ?? "";
	for (const c of a.keyChanges ?? []) if (c.start <= seconds + 0.0005 && c.key) key = c.key;
	return key;
}
