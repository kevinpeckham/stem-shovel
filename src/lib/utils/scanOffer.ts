import type { Detection } from "#lib/audio/analysis.js";
import type { SongChangeKind } from "#lib/constants/songChanges.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import { isCompoundMeter } from "./isCompoundMeter.js";
import { tempoLadderMatch } from "./tempoLadderMatch.js";

/** The declared tempo matched on the detected one's ladder: the rung and the song's own bpm. */
export interface ScanLadder {
	factor: number;
	declared: number;
}

export interface ScanOffer {
	/** The scan rows still worth offering: all of them, unless the tempo sits on the declared one's ladder. */
	values: SongChange[];
	/** The ladder match against the song's tempo at 0:00; null without one or off the ladder. */
	ladder: ScanLadder | null;
	/** The kinds the scan agrees with the song on (and so leaves out of `values`). */
	agrees: SongChangeKind[];
}

const at0 = (changes: SongChange[], kind: SongChangeKind) =>
	changes.find((c) => c.kind === kind && c.start === 0)?.value ?? null;

const keyValues = (rows: SongChange[]) =>
	rows
		.filter((r) => r.kind === "key")
		.toSorted((a, b) => a.start - b.start)
		.map((r) => r.value);

function ladderOf(detection: Pick<Detection, "tempo" | "meter">, changes: SongChange[]) {
	const declared = Number.parseFloat(at0(changes, "tempo") ?? "");
	const compound =
		detection.tempo.subdivision === 3 ||
		isCompoundMeter(at0(changes, "meter")) ||
		isCompoundMeter(detection.meter.value);
	const match = tempoLadderMatch(declared, detection.tempo.bpm, { compound });
	return match ? { factor: match.factor, declared } : null;
}

/**
 * What a scan offers a song that already has settings: with a declared
 * tempo on the detected one's ladder (direct, double, half; 1.5 and 2/3
 * when the beat or either meter is compound, docs/tempo-grid-plan.md), the
 * tempo agrees and leaves the offer, and so do the time signature and the
 * keys when they read the same as the song's. Off the ladder, or without
 * a declared tempo, every row is offered, as before.
 */
export function scanOffer(
	detection: Pick<Detection, "tempo" | "meter">,
	rows: SongChange[],
	changes: SongChange[],
): ScanOffer {
	const ladder = ladderOf(detection, changes);
	if (!ladder) return { values: rows, ladder: null, agrees: [] };
	const heard = keyValues(rows);
	const own = keyValues(changes);
	const agrees: SongChangeKind[] = ["tempo"];
	if (rows.some((r) => r.kind === "meter" && r.value === at0(changes, "meter")))
		agrees.push("meter");
	if (heard.length > 0 && heard.join("|") === own.join("|")) agrees.push("key");
	return { values: rows.filter((r) => !agrees.includes(r.kind)), ladder, agrees };
}
