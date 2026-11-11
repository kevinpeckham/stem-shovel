import { barGrid, barSecondsAt } from "#lib/audio/measures.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import type { TrackerBarGrid } from "./trackerBarGrid.js";

/** A bar this far from the declared one, as a fraction, is a different tempo and not the recording's drift. */
const BAR_TOLERANCE = 0.04;

const at0 = (changes: SongChange[], kind: SongChange["kind"]) =>
	changes.find((c) => c.kind === kind && c.start === 0)?.value ?? null;

const seconds = (s: number) => `${s.toFixed(2)} s`;

/**
 * What a draft says when the recording's bars are not the song's settings'
 * bars: the meters differ, or the declared tempo makes a bar more than 4%
 * longer or shorter than the tracker's. Null when they agree or the song
 * declares nothing to disagree with. The comparison is in seconds a bar,
 * so the unit a tempo is counted in (a 6/8 song's eighths) never enters.
 */
export function trackerGridNote(
	tracker: TrackerBarGrid,
	changes: SongChange[],
	startAt: number | null,
): string | null {
	const meter = at0(changes, "meter");
	const tempo = at0(changes, "tempo");
	const grid = barGrid(changes, startAt);
	const declaredBar = grid ? barSecondsAt(grid, grid.startAt) : null;
	const meterDiffers = meter !== null && meter !== tracker.meter;
	const barDiffers =
		declaredBar !== null && Math.abs(tracker.barSeconds / declaredBar - 1) > BAR_TOLERANCE;
	if (!meterDiffers && !barDiffers) return null;
	const declared = [
		meter,
		tempo === null ? null : `at ${tempo} bpm`,
		declaredBar === null ? null : `(a bar every ${seconds(declaredBar)})`,
	]
		.filter((part) => part !== null)
		.join(" ");
	return `The recording plays ${tracker.meter} with a bar every ${seconds(tracker.barSeconds)}; the song is set to ${declared}. The draft follows the recording, so its bar numbers will not match the player's count until the song's tempo and time signature are changed.`;
}
