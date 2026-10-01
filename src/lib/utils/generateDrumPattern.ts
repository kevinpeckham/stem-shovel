import {
	DEFAULT_DRUM_PANS,
	DEFAULT_DRUM_SENDS,
	DRUM_USUAL_LEVEL,
	MAX_DRUM_ROWS,
	type DrumVoiceId,
} from "$lib/constants/drumMachine";
import type { DrumGeneratorRow, DrumGeneratorStyle } from "$lib/constants/drumGenerator";
import type { DrumPattern, DrumRow } from "$lib/val/DrumPatternSchema";
import { seededRandom } from "./seededRandom";

/**
 * A pattern drawn from a style (docs/drum-machine.md, "Pattern
 * generator"), in the shape of the pattern given: its meter and steps,
 * its rows with their levels, pans, mutes and sends kept. The style's
 * backbone is always there; each maybe is a draw against its chance
 * scaled by the density (0 leaves only the backbone, 0.5 is the chance
 * as written, 1 doubles it). A voice the style plays that the pattern
 * lacks gets a row, while there is room; a row of a voice the style does
 * not play is kept, silent. Two-bar patterns draw each bar on its own.
 * The same seed gives the same pattern.
 */
export function generateDrumPattern(
	style: DrumGeneratorStyle,
	density: number,
	from: DrumPattern,
	seed: number,
): DrumPattern {
	const random = seededRandom(seed);
	const scale = Math.min(1, Math.max(0, density)) * 2;
	const template = from.meter === "6/8" ? style.six : style.four;
	const barSteps = from.meter === "6/8" ? 12 : from.meter === "3/4" ? 12 : 16;
	// The template's step for each of the pattern's steps in one bar: every one, every other, or the first three beats.
	const stepsPerBar = from.steps <= barSteps ? from.steps : from.steps / 2;
	const stride = barSteps / stepsPerBar; // 1, or 2 for an eighth-note grid
	const bars = from.steps / stepsPerBar;

	const draw = (row: DrumGeneratorRow): number[] => {
		const cells: number[] = [];
		for (let bar = 0; bar < bars; bar++) {
			for (let s = 0; s < stepsPerBar; s++) {
				const at = Math.round(s * stride);
				const hit = weight(row.hits[at] ?? ".");
				const ghost = row.ghosts ? weight(row.ghosts[at] ?? ".") : null;
				let velocity = 0;
				if (hit.always) velocity = hit.velocity;
				else if (hit.chance && random() < Math.min(1, hit.chance * scale)) velocity = 2;
				else if (ghost?.chance && random() < Math.min(1, ghost.chance * scale)) velocity = 1;
				cells.push(velocity);
			}
		}
		return cells;
	};

	const rows: DrumRow[] = from.rows.map((r) => ({ ...r, cells: r.cells.map(() => 0) }));
	const taken = new Set<number>();
	for (const line of template) {
		const index = rows.findIndex((r, i) => r.voice === line.voice && !taken.has(i));
		if (index >= 0) {
			taken.add(index);
			rows[index] = { ...rows[index]!, cells: draw(line) };
		} else if (rows.length < MAX_DRUM_ROWS) {
			rows.push(newRow(line.voice, draw(line)));
		}
	}
	return { meter: from.meter, steps: from.steps, rows };
}

/** What a template character means: the backbone with its velocity, or a chance in tenths. */
function weight(c: string): { always: boolean; velocity: number; chance: number } {
	if (c === "X") return { always: true, velocity: 3, chance: 0 };
	if (c === "x") return { always: true, velocity: 2, chance: 0 };
	if (c === "o") return { always: true, velocity: 1, chance: 0 };
	const digit = Number(c);
	return { always: false, velocity: 0, chance: Number.isInteger(digit) ? digit / 10 : 0 };
}

function newRow(voice: DrumVoiceId, cells: number[]): DrumRow {
	return {
		voice,
		level: DRUM_USUAL_LEVEL[voice] ?? 0.8,
		pan: DEFAULT_DRUM_PANS[voice],
		mute: false,
		...DEFAULT_DRUM_SENDS[voice],
		cells,
	};
}
