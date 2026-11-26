import type { Declared } from "@barmark/listen";
import { beatsOf, parseMeter } from "barmark";
import { type BarGrid, barSecondsAt, beatsPerBarAt } from "#lib/audio/measures.js";

/**
 * The song's meter and tempo at its start of bar 1 as @barmark/listen
 * declares them (`findGrid`, the fit of `alignChart`): the meter as the
 * song's time signature writes it, the tempo in barmark grammar 2.1's beat
 * (the dotted quarter in 6/8), where the song counts the meter's bottom
 * note (6/8 at 120 is 120 eighths, 40 dotted quarters; FINDINGS.md "A
 * played bar's `tempo` is in barmark's beat"). The tempo is reckoned from
 * the grid's own bar there (`barSecondsAt`), so the bar listen measures
 * against is the bar the app measured against, ramps and all; the package
 * counts `beatsPerBar` from the meter's top number, as the grid does. A
 * time signature that does not read, or whose top number is not the
 * grid's beats, is taken as that many quarters, which gives the same bar.
 */
export function listenDeclared(
	grid: BarGrid,
	changes: { kind: string; start: number; value: string }[],
): Declared {
	const at = grid.startAt;
	const beats = beatsPerBarAt(grid, at);
	const meters = changes.filter((c) => c.kind === "meter");
	const written = (meters.findLast((c) => at >= c.start) ?? meters[0])?.value;
	const read = written ? parseMeter(written) : null;
	const meter = read?.n === beats ? read : parseMeter(`${beats}/4`)!;
	return {
		meter: `${meter.n}/${meter.d}`,
		tempo: (beatsOf(meter) * 60) / barSecondsAt(grid, at),
	};
}
