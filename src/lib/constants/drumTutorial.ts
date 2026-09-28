import type { DrumProject } from "../val/DrumPatternSchema";
import { DEFAULT_DRUM_FX, DEFAULT_DRUM_SENDS, type DrumVoiceId } from "./drumMachine";

/**
 * The drum machine's walk-through (docs/drum-machine.md): a simple rock
 * beat from an empty kit, one thing per step. A step names the cells it
 * wants (voice, steps, velocity; `off` for cells that must be empty) and
 * a control to point at; `done` says whether the project has caught up.
 * The panel (`DrumTutorial.svelte`) highlights those cells and can do the
 * step itself. Everything here is plain data over the project type so it
 * can be tested without a browser.
 */
export interface TutorialCells {
	voice: DrumVoiceId;
	steps: number[];
	/** 1 ghost, 2 normal, 3 accent; 0 means these cells must be off. */
	velocity: 0 | 1 | 2 | 3;
	/** Which pattern, by index; the first unless said. */
	pattern?: number;
}
export type TutorialControl = "play" | "copy" | "humanize" | "keep";
export interface TutorialStep {
	id: string;
	title: string;
	/** Plain text; the panel renders it as one paragraph. */
	text: string;
	cells?: TutorialCells[];
	control?: TutorialControl;
	/** Whether the project (and what the person has done) satisfies the step. */
	done: (project: DrumProject, seen: { played: boolean }) => boolean;
}

/** Five rows and nothing on them, 110 bpm, the acoustic kit. */
export const TUTORIAL_PROJECT: DrumProject = {
	v: 2,
	bpm: 110,
	swing: 0,
	swingGrid: 16,
	humanize: 0,
	fx: { ...DEFAULT_DRUM_FX },
	kit: "acoustic",
	patterns: [
		{
			meter: "4/4",
			steps: 16,
			rows: [
				{
					voice: "kick",
					level: 0.9,
					pan: 0,
					mute: false,
					...DEFAULT_DRUM_SENDS["kick"],
					cells: Array(16).fill(0),
				},
				{
					voice: "snare",
					level: 0.8,
					pan: 0,
					mute: false,
					...DEFAULT_DRUM_SENDS["snare"],
					cells: Array(16).fill(0),
				},
				{
					voice: "hat-closed",
					level: 0.6,
					pan: 0,
					mute: false,
					...DEFAULT_DRUM_SENDS["hat-closed"],
					cells: Array(16).fill(0),
				},
				{
					voice: "hat-open",
					level: 0.5,
					pan: 0,
					mute: false,
					...DEFAULT_DRUM_SENDS["hat-open"],
					cells: Array(16).fill(0),
				},
				{
					voice: "crash",
					level: 0.6,
					pan: 0,
					mute: false,
					...DEFAULT_DRUM_SENDS["crash"],
					cells: Array(16).fill(0),
				},
			],
		},
	],
};

/** Whether every named cell has the velocity (or, for 0, is off) in the pattern. */
export function cellsSatisfied(project: DrumProject, wants: TutorialCells[]): boolean {
	return wants.every((w) => {
		const row = project.patterns[w.pattern ?? 0]?.rows.find((r) => r.voice === w.voice);
		if (!row) return false;
		return w.steps.every((s) =>
			w.velocity === 0 ? !row.cells[s] : (row.cells[s] ?? 0) === w.velocity,
		);
	});
}
const cells = (wants: TutorialCells[]) => (p: DrumProject) => cellsSatisfied(p, wants);

export const TUTORIAL_STEPS: TutorialStep[] = [
	{
		id: "grid",
		title: "The grid",
		text: "Rows are drums, columns are sixteenth notes. A bar of 4/4 is sixteen columns, shaded in groups of four: each group is one beat. You are starting with an empty kit of five drums at 110 beats per minute. Your own beat is kept; Undo brings it back when you are done.",
		done: () => true,
	},
	{
		id: "kick",
		title: "Kick on one and three",
		text: "Rock starts with the kick drum on beats 1 and 3. Tap the first cell of the first group and the first cell of the third group in the Kick row. The highlighted cells are the ones.",
		cells: [{ voice: "kick", steps: [0, 8], velocity: 2 }],
		done: cells([{ voice: "kick", steps: [0, 8], velocity: 2 }]),
	},
	{
		id: "snare",
		title: "Snare on two and four",
		text: "The snare answers on beats 2 and 4. That is the backbeat, the thing you clap along to. Tap the first cell of the second and fourth groups in the Snare row.",
		cells: [{ voice: "snare", steps: [4, 12], velocity: 2 }],
		done: cells([{ voice: "snare", steps: [4, 12], velocity: 2 }]),
	},
	{
		id: "play",
		title: "Hear it",
		text: "Press Play (or the space bar). Boom, bap, boom, bap: that is the skeleton of nearly every rock song. Leave it running; you can keep editing while it plays.",
		control: "play",
		done: (_p, seen) => seen.played,
	},
	{
		id: "hats",
		title: "Eighth-note hats",
		text: "The hi-hat keeps time. Put a closed hat on every other column, so eight hits to the bar. Press one cell and drag across the row to paint several at once.",
		cells: [{ voice: "hat-closed", steps: [0, 2, 4, 6, 8, 10, 12, 14], velocity: 2 }],
		done: cells([{ voice: "hat-closed", steps: [0, 2, 4, 6, 8, 10, 12, 14], velocity: 2 }]),
	},
	{
		id: "push",
		title: "A push into the backbeat",
		text: 'One extra kick makes it move. Add a kick on the third cell of the third group, the "and" after beat 3, so the kicks go boom, boom-boom.',
		cells: [{ voice: "kick", steps: [10], velocity: 2 }],
		done: cells([{ voice: "kick", steps: [0, 8, 10], velocity: 2 }]),
	},
	{
		id: "open-hat",
		title: "Open the hat before the top",
		text: "An open hi-hat on the last eighth lifts the bar into the next one. Put an open hat on the last column but one, and turn the closed hat off on that same column: on a real kit the closed hat would choke it.",
		cells: [
			{ voice: "hat-open", steps: [14], velocity: 2 },
			{ voice: "hat-closed", steps: [14], velocity: 0 },
		],
		done: cells([
			{ voice: "hat-open", steps: [14], velocity: 2 },
			{ voice: "hat-closed", steps: [14], velocity: 0 },
		]),
	},
	{
		id: "accent",
		title: "Accent the backbeat",
		text: "A drummer hits the backbeat harder. Hold your finger on each snare cell (or right-click it, or shift-click) until it steps up to an accent, the brighter cell with the white edge.",
		cells: [{ voice: "snare", steps: [4, 12], velocity: 3 }],
		done: cells([{ voice: "snare", steps: [4, 12], velocity: 3 }]),
	},
	{
		id: "humanize",
		title: "Loosen it a little",
		text: "A machine hits every cell in exactly the same place. Drag Humanize to about 15% and every hit lands a hair early or late, a little louder or softer, the way a person plays.",
		control: "humanize",
		done: (p) => p.humanize > 0,
	},
	{
		id: "crash",
		title: "A crash on the one",
		text: "Mark the top of the bar with a crash cymbal on the very first column. It rings across the bar; if that is too much every time round, the fill in the next step is where it belongs.",
		cells: [{ voice: "crash", steps: [0], velocity: 2 }],
		done: cells([{ voice: "crash", steps: [0], velocity: 2 }]),
	},
	{
		id: "copy",
		title: "A second pattern for a fill",
		text: "Press the copy button above the grid to make pattern 2, a copy of this one. Patterns are how a beat gets a fill, a chorus, a breakdown.",
		control: "copy",
		done: (p) => p.patterns.length >= 2,
	},
	{
		id: "fill",
		title: "The fill",
		text: "In pattern 2, turn the last group into a snare roll: snare on all four cells of the fourth group. Make the last one an accent if you like. When the beat plays, pick pattern 1 or 2 while it runs and it switches at the top of the cycle.",
		cells: [{ voice: "snare", steps: [12, 13, 14, 15], velocity: 2, pattern: 1 }],
		done: (p) => {
			const snare = p.patterns[1]?.rows.find((r) => r.voice === "snare");
			return !!snare && [12, 13, 14, 15].every((s) => (snare.cells[s] ?? 0) > 0);
		},
	},
	{
		id: "keep",
		title: "Keep it",
		text: "That is a rock beat. Copy link puts it in the address to send to the band; Download gives you a WAV to loop or a MIDI file for a DAW; signed in, Save keeps it in your account. Try the Presets menu next to hear where other styles start.",
		control: "keep",
		done: () => true,
	},
];
