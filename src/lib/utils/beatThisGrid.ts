export interface BeatThisGrid {
	/** 60 / the median inter-beat interval, whole bpm; null under 2 beats. */
	tempo: number | null;
	/** The modal beats per bar, the smallest on a tie; null under 2 downbeats. */
	beatsPerBar: number | null;
	meter: "4/4" | "3/4" | "6/8" | null;
	/** The tempo in the meter's counting unit: dotted quarters in 6/8. */
	chartTempo: number | null;
	/** How many bars had each beat count. */
	counts: Record<number, number>;
}

/** numpy's median: the mean of the two middle values for an even count. */
function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function tempoOf(beats: number[]): number | null {
	if (beats.length < 2) return null;
	const intervals = beats.slice(1).map((b, i) => b - beats[i]);
	return Math.round(60 / median(intervals));
}

/** Beats per bar for each pair of consecutive downbeats: the beats strictly between, plus one. */
function barCounts(beats: number[], downbeats: number[]): number[] {
	const out: number[] = [];
	for (let i = 1; i < downbeats.length; i++) {
		const from = downbeats[i - 1];
		const to = downbeats[i];
		out.push(beats.filter((b) => b > from && b < to).length + 1);
	}
	return out;
}

/** The most frequent count, the smallest on a tie; null for none. */
function modalOf(counts: Record<number, number>): number | null {
	let best: number | null = null;
	for (const [key, n] of Object.entries(counts)) {
		const k = Number(key);
		if (best === null || n > counts[best] || (n === counts[best] && k < best)) best = k;
	}
	return best;
}

function meterOf(beatsPerBar: number | null): BeatThisGrid["meter"] {
	if (beatsPerBar === null) return null;
	if (beatsPerBar === 6) return "6/8";
	return beatsPerBar === 3 ? "3/4" : "4/4";
}

/**
 * The bench's tempo and meter from Beat This's beats and downbeats (seconds).
 * Tempo is 60 over the median inter-beat interval, rounded to a whole bpm.
 * Each bar's beat count is measured downbeat to downbeat, and the modal count
 * names the meter by Study 41's rule: 6 is "6/8", counted in dotted quarters
 * so its chart tempo is a third of the beat tempo; 3 is "3/4"; any other
 * count reads as "4/4" at the beat tempo.
 */
export function beatThisGrid(beats: number[], downbeats: number[]): BeatThisGrid {
	const tempo = tempoOf(beats);
	const counts: Record<number, number> = {};
	for (const n of barCounts(beats, downbeats)) counts[n] = (counts[n] ?? 0) + 1;
	const beatsPerBar = modalOf(counts);
	const meter = meterOf(beatsPerBar);
	const chartTempo = tempo !== null && meter === "6/8" ? Math.round(tempo / 3) : tempo;
	return { tempo, beatsPerBar, meter, chartTempo, counts };
}
