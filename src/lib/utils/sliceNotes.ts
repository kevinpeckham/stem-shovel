import type { StudioNote } from "../val/StudioSchema";

/**
 * The notes of a window `[from, to)` of a MIDI take, re-timed from `from`
 * (docs/multitrack-recorder.md, phase 3: a loop pass or a punch region cut
 * from the whole take, as `sliceBuffer` cuts audio). A note that starts
 * inside the window is kept and cut at its end; one that began before the
 * window is left to the earlier piece.
 */
export function sliceNotes(notes: StudioNote[], from: number, to: number): StudioNote[] {
	const out: StudioNote[] = [];
	for (const n of notes) {
		if (n.t < from || n.t >= to) continue;
		const d = Math.min(n.d, to - n.t);
		if (d < 0.001) continue;
		out.push({ ...n, t: round4(n.t - from), d: round4(d) });
	}
	return out;
}

const round4 = (x: number) => Math.round(x * 10000) / 10000;
