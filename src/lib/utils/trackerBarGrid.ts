import { type BeatsMeter, gridFromBeats } from "@barmark/listen";
import type { BeatThisBeats } from "./beatThisBeats.js";

export interface TrackerBarGrid {
	/** Where each bar starts in the mix, and where the last one ends (`@barmark/sync`'s bar grid). */
	bars: number[];
	/** The meter the recording reads as (stem-bench Study 41: from the modal beats per bar). */
	meter: BeatsMeter;
	/** Seconds in the usual bar: the median downbeat to downbeat. */
	barSeconds: number;
}

/**
 * The beat tracker's bars as a draft's bar grid: `@barmark/listen`'s
 * `gridFromBeats`, which holds the arithmetic this file used to (the port
 * was checked against it on the dev songs' readings and 400 seeded ones
 * before the app's copy went; docs/audio-engine.md, "The tracker's bars").
 * Every downbeat is a bar line as read, adjacent half bars joined, plus a
 * closing bar to the audio's end when at least half a bar is left; the
 * meter is the modal count's (6 is 6/8, 3 is 3/4, anything else 4/4).
 *
 * Null when the package refuses the reading: too few bars to call it the
 * song's (under four), bars that do not settle on one count of beats
 * (a steady share under 0.4, stem-bench Study 44), or stored beats it
 * cannot read. The draft then keeps the declared grid.
 *
 * The package also reports a pickup (the beats before bar one, as a bar
 * 0); the draft does not write it yet, so those beats stay off the chart
 * as they always have.
 */
export function trackerBarGrid(read: BeatThisBeats | null): TrackerBarGrid | null {
	if (!read) return null;
	const tracked = gridFromBeats({
		beats: read.beats,
		downbeats: read.downbeats,
		duration: read.duration,
	});
	if (!tracked.ok) return null;
	const { grid, meter, reading } = tracked.value;
	return { bars: grid.bars, meter, barSeconds: reading.barSeconds };
}
