import type { Detection } from "#lib/audio/analysis.js";
import type { SongChangeKind } from "#lib/constants/songChanges.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import { isCompoundMeter } from "./isCompoundMeter.js";
import { isTripleMeter } from "./isTripleMeter.js";
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

/** The rungs only the song's meter opens: a match there is a count difference, and so is the meter's. */
const METER_RUNGS = [1.5, 2 / 3, 3];

/**
 * The song's tempo at 0:00 on the detected one's ladder. The 3:2 and ×3
 * gates are the song's own meter, never the detection's: the detector's
 * compound flag can fire at a pulse two thirds off whose third is the true
 * eighth (stem-bench Study 11b, a song at 145 heard at 96.7), and letting
 * it open the 3:2 rungs silenced the very disagreement the offer is for.
 */
function ladderOf(detection: Pick<Detection, "tempo">, changes: SongChange[]) {
	const declared = Number.parseFloat(at0(changes, "tempo") ?? "");
	const meter = at0(changes, "meter");
	const match = tempoLadderMatch(declared, detection.tempo.bpm, {
		compound: isCompoundMeter(meter),
		triple: isTripleMeter(meter),
	});
	return match ? { factor: match.factor, declared } : null;
}

/**
 * What a scan offers a song that already has settings: with a declared
 * tempo on the detected one's ladder (direct, double, half; 1.5 and 2/3
 * when the song's meter is compound, 3 when it is three to the bar,
 * docs/tempo-grid-plan.md), the tempo agrees and leaves the offer, and so
 * do the keys when they read the same as the song's. The time signature
 * agrees when it reads the same, or when the match came on a rung the
 * song's meter opened: there the meter difference is the count difference
 * (a 3/4 waltz at 224 heard as 6/8 at 74.7 is one grid at ×3). Off the
 * ladder, or without a declared tempo, every row is offered, as before.
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
	if (
		METER_RUNGS.some((f) => Math.abs(f - ladder.factor) < 1e-9) ||
		rows.some((r) => r.kind === "meter" && r.value === at0(changes, "meter"))
	)
		agrees.push("meter");
	if (heard.length > 0 && heard.join("|") === own.join("|")) agrees.push("key");
	return { values: rows.filter((r) => !agrees.includes(r.kind)), ladder, agrees };
}
