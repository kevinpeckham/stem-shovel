import type { SongChange } from "../val/SongChangeSchema";

/** What Dawn keeps of a song's timed changes (docs/multitrack-recorder.md, "Key, and the changes both ways"). */
export interface StudioChanges {
	bpm: number;
	beatsPerBar: number;
	tempoChanges?: { start: number; bpm: number }[];
	meterChanges?: { start: number; beatsPerBar: number }[];
	key?: string;
	keyChanges?: { start: number; key: string }[];
}

const clampBpm = (n: number) => Math.min(300, Math.max(30, Math.round(n * 10) / 10));
const beatsOf = (value: string): number | null => {
	const n = Number(value.split("/")[0]);
	return Number.isInteger(n) && n >= 2 && n <= 7 ? n : null;
};

/**
 * A song's changes (tempo, key, time signature from a second each) as Dawn's
 * arrangement holds them: the first of each kind is the song's own value from
 * zero, the rest are changes on the ruler. A tempo outside Dawn's 30–300 is
 * clamped; a time signature's beats outside 2–7 are left out (Dawn counts
 * beats a bar alone, the note value lost); a key is kept as written.
 */
export function songChangesToStudio(changes: SongChange[]): StudioChanges {
	const sorted = [...changes].sort((a, b) => a.start - b.start);
	const tempos = sorted.filter((c) => c.kind === "tempo" && Number.isFinite(Number(c.value)));
	const meters = sorted.filter((c) => c.kind === "meter" && beatsOf(c.value) !== null);
	const keys = sorted.filter((c) => c.kind === "key" && c.value.trim() !== "");
	const out: StudioChanges = {
		bpm: tempos.length ? clampBpm(Number(tempos[0]!.value)) : 120,
		beatsPerBar: meters.length ? beatsOf(meters[0]!.value)! : 4,
	};
	const laterTempos = tempos.slice(1).filter((c) => c.start > 0);
	const laterMeters = meters.slice(1).filter((c) => c.start > 0);
	const laterKeys = keys.slice(1).filter((c) => c.start > 0);
	if (laterTempos.length)
		out.tempoChanges = laterTempos.map((c) => ({ start: c.start, bpm: clampBpm(Number(c.value)) }));
	if (laterMeters.length)
		out.meterChanges = laterMeters.map((c) => ({ start: c.start, beatsPerBar: beatsOf(c.value)! }));
	if (keys.length) out.key = keys[0]!.value.trim();
	if (laterKeys.length)
		out.keyChanges = laterKeys.map((c) => ({ start: c.start, key: c.value.trim() }));
	return out;
}

/**
 * The other way: Dawn's tempo, meter and key, with their changes, as a
 * song's changes for a song made from a Dawn song. The meter goes out over
 * quarter notes (`n/4`), which is what Dawn counts.
 */
export function studioChangesToSong(a: StudioChanges): SongChange[] {
	const out: SongChange[] = [
		{ kind: "tempo", start: 0, value: String(a.bpm) },
		{ kind: "meter", start: 0, value: `${a.beatsPerBar}/4` },
	];
	if (a.key?.trim()) out.push({ kind: "key", start: 0, value: a.key.trim() });
	for (const c of a.tempoChanges ?? [])
		out.push({ kind: "tempo", start: c.start, value: String(c.bpm) });
	for (const c of a.meterChanges ?? [])
		out.push({ kind: "meter", start: c.start, value: `${c.beatsPerBar}/4` });
	for (const c of a.keyChanges ?? []) out.push({ kind: "key", start: c.start, value: c.key });
	return out.sort((x, y) => x.start - y.start);
}

/** The key in force at a second: the song's own, or the last change at or before it; "" without one. */
export function studioKeyAt(a: Pick<StudioChanges, "key" | "keyChanges">, seconds: number): string {
	let key = a.key ?? "";
	for (const c of a.keyChanges ?? []) if (c.start <= seconds + 0.0005 && c.key) key = c.key;
	return key;
}
