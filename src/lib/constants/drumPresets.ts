import type { DrumFx } from "../val/DrumPatternSchema";
import type { DrumKitId, DrumMeterId, DrumSwingGrid, DrumVoiceId } from "./drumMachine";

/**
 * The preset beats (docs/drum-machine.md): each a project written as
 * rows of steps, one character a sixteenth: `.` rest, `x` a hit, `X` an
 * accent, `o` a ghost note. A row's string is exactly as long as the
 * pattern; `drumPresetProject` turns a preset into a project and the test
 * checks every one. Levels are the kit's usual balance unless a row says
 * otherwise. Grouped by style for the menu.
 */
export interface DrumPresetRow {
	voice: DrumVoiceId;
	cells: string;
	level?: number;
	pan?: number;
	/** Sends to the delay and the reverb, 0 to 1. */
	delaySend?: number;
	reverbSend?: number;
}
export interface DrumPreset {
	id: string;
	name: string;
	style: string;
	bpm: number;
	swing?: number;
	/** 16 unless said: a beat with nothing on the sixteenths swings its eighths. */
	swingGrid?: DrumSwingGrid;
	humanize?: number;
	/** The effects the beat arrives with, over the defaults (every preset names its own, Kevin's call: a preset resets the effects to what suits it). */
	fx?: Partial<DrumFx>;
	/** The kit the beat arrives on (every preset names one, Kevin's call; "room" is not chosen until its identity settles). */
	kit?: DrumKitId;
	meter?: DrumMeterId;
	patterns: DrumPresetRow[][];
}

export const DRUM_PRESET_STYLES = [
	"Rock",
	"Pop and funk",
	"Hip-hop and electronic",
	"World",
	"Other meters",
	"Fills",
] as const;

export const DRUM_PRESETS: DrumPreset[] = [
	// ---- Rock ----
	{
		id: "four-on-the-floor",
		name: "Four on the floor",
		style: "Rock",
		bpm: 120,
		fx: { reverbReturn: 0.2 },
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X...x...X...x..." },
				{ voice: "snare", cells: "....X.......X..." },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x.x.x." },
				{ voice: "hat-open", cells: "..............x." },
			],
		],
	},
	{
		id: "driving-eighths",
		name: "Driving eighths",
		style: "Rock",
		bpm: 140,
		fx: { reverbReturn: 0.2 },
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X.....x.X...x.x." },
				{ voice: "snare", cells: "....X.......X..." },
				{ voice: "hat-closed", cells: "X.x.X.x.X.x.X.x." },
				{ voice: "crash", cells: "X...............", level: 0.6 },
			],
		],
	},
	{
		id: "half-time",
		name: "Half-time",
		style: "Rock",
		bpm: 90,
		fx: { reverbReturn: 0.4, delayReturn: 0.15, delayTime: 6, toneBottom: 0.3 },
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X.........x.....X.....x...x....." },
				{ voice: "snare", cells: "........X...............X......." },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x." },
				{ voice: "hat-open", cells: "..............................x." },
			],
		],
	},
	{
		id: "train-beat",
		name: "Train beat",
		style: "Rock",
		bpm: 150,
		fx: { reverbReturn: 0.15 },
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X.......X......." },
				{ voice: "snare", cells: "oXoxoXoxoXoxoXox" },
				{ voice: "hat-closed", cells: "x...x...x...x..." },
			],
		],
	},
	// ---- Pop and funk ----
	{
		id: "pop-backbeat",
		name: "Pop backbeat",
		style: "Pop and funk",
		bpm: 112,
		fx: { reverbReturn: 0.3, delayReturn: 0.15, delayTime: 3, toneAir: 0.15 },
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X.......x.x....." },
				{ voice: "snare", cells: "....X.......X..." },
				{ voice: "clap", cells: "....x.......x...", level: 0.5 },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x.x.x." },
			],
		],
	},
	{
		id: "motown",
		name: "Motown",
		style: "Pop and funk",
		bpm: 118,
		fx: { reverbReturn: 0.35, delayReturn: 0.1, delayTime: 2, delayAnalog: true },
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X...X...X...X..." },
				{ voice: "snare", cells: "X...X...X...X..." },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x.x.x." },
				{ voice: "cowbell", cells: "..x...x...x...x.", level: 0.4 },
			],
		],
	},
	{
		id: "funk",
		name: "Funk",
		style: "Pop and funk",
		bpm: 104,
		fx: { reverbReturn: 0.1, toneAir: 0.15 },
		swing: 0.15,
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X..x..x...x..x..X..x..x.x.x....." },
				{ voice: "snare", cells: "....X..o..o.X..o....X..o.o..X.o." },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x." },
				{ voice: "hat-open", cells: "..........x...............x....." },
			],
		],
	},
	{
		id: "disco",
		name: "Disco",
		style: "Pop and funk",
		bpm: 122,
		fx: { reverbReturn: 0.3, delayReturn: 0.1, delayTime: 2, toneAir: 0.2 },
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X...X...X...X..." },
				{ voice: "snare", cells: "....X.......X..." },
				{ voice: "hat-closed", cells: "x...x...x...x..." },
				{ voice: "hat-open", cells: "..x...x...x...x." },
				{ voice: "clap", cells: "....x.......x...", level: 0.5 },
			],
		],
	},
	// ---- Hip-hop and electronic ----
	{
		id: "boom-bap",
		name: "Boom bap",
		style: "Hip-hop and electronic",
		bpm: 92,
		fx: {
			reverbReturn: 0.15,
			delayReturn: 0.1,
			delayTime: 3,
			delayAnalog: true,
			fuzzDrive: 0.1,
			toneBottom: 0.4,
		},
		swing: 0.35,
		humanize: 0.2,
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X.....x...x.....X..x......x....." },
				{ voice: "snare", cells: "....X.......X.......X.......X..." },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x." },
				{ voice: "hat-open", cells: "..............x...............x." },
			],
		],
	},
	{
		id: "trap",
		name: "Trap",
		style: "Hip-hop and electronic",
		bpm: 140,
		fx: { reverbReturn: 0.2, delayReturn: 0.2, delayTime: 2, toneBottom: 0.5 },
		kit: "electronic",
		patterns: [
			[
				{ voice: "kick", cells: "X......x..x.....X.....x.........", level: 1 },
				{ voice: "clap", cells: "........X...............X......." },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x.xxxxx.x.x.x.xxx.xx.x" },
				{ voice: "hat-open", cells: "......x...............x........." },
			],
		],
	},
	{
		id: "house",
		name: "House",
		style: "Hip-hop and electronic",
		bpm: 124,
		fx: { reverbReturn: 0.15, delayReturn: 0.25, delayTime: 3, toneBottom: 0.4 },
		kit: "electronic",
		patterns: [
			[
				{ voice: "kick", cells: "X...X...X...X..." },
				{ voice: "clap", cells: "....X.......X..." },
				{ voice: "hat-open", cells: "..x...x...x...x." },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x.x.x.", level: 0.4 },
				{ voice: "rim", cells: "...x..x....x..x.", level: 0.5, pan: 0.4 },
			],
		],
	},
	{
		id: "techno",
		name: "Techno",
		style: "Hip-hop and electronic",
		bpm: 132,
		fx: { reverbReturn: 0.1, delayReturn: 0.3, delayTime: 3, delayAnalog: true, toneBottom: 0.4 },
		kit: "electronic",
		patterns: [
			[
				{ voice: "kick", cells: "X...X...X...X...", level: 1 },
				{ voice: "hat-open", cells: "..x...x...x...x." },
				{ voice: "hat-closed", cells: "xoxoxoxoxoxoxoxo", level: 0.5 },
				{ voice: "clap", cells: "....x.......x...", level: 0.6 },
				{ voice: "rim", cells: "x..x..x.x..x..x.", level: 0.4, pan: -0.4, delaySend: 0.5 },
			],
		],
	},
	{
		id: "drum-and-bass",
		name: "Drum and bass",
		style: "Hip-hop and electronic",
		bpm: 174,
		fx: { reverbReturn: 0.2, delayReturn: 0.15, delayTime: 4, toneBottom: 0.4 },
		kit: "electronic",
		patterns: [
			[
				{ voice: "kick", cells: "X.........x.....X.........x....." },
				{ voice: "snare", cells: "....X.......X.......X.......X..." },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x." },
				{ voice: "rim", cells: "..o...o.o.....o...o...o.o...o...", level: 0.5 },
			],
		],
	},
	// ---- World ----
	{
		id: "one-drop",
		name: "Reggae one drop",
		style: "World",
		bpm: 76,
		fx: { reverbReturn: 0.3, delayReturn: 0.35, delayTime: 3, delayAnalog: true, toneBottom: 0.3 },
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "........X......." },
				{ voice: "rim", cells: "........X.......", delaySend: 0.6, reverbSend: 0.3 },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x.x.x." },
				{ voice: "hat-open", cells: "..x...x...x...x.", level: 0.4 },
			],
		],
	},
	{
		id: "bossa-nova",
		name: "Bossa nova",
		style: "World",
		bpm: 130,
		fx: { reverbReturn: 0.3 },
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X..x..X.X..x..X." },
				{ voice: "rim", cells: "x..x..x...x..x.." },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x.x.x.", level: 0.5 },
			],
		],
	},
	{
		id: "samba",
		name: "Samba",
		style: "World",
		bpm: 100,
		fx: { reverbReturn: 0.25 },
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X..xX..xX..xX..x" },
				{ voice: "tom-low", cells: "...x..x....x..x.", level: 0.6 },
				{ voice: "hat-closed", cells: "xoxxxoxxxoxxxoxx", level: 0.5 },
				{ voice: "cowbell", cells: "x.x.x..x.x.x.x..", level: 0.4 },
			],
		],
	},
	{
		id: "shuffle",
		name: "Shuffle",
		style: "World",
		bpm: 108,
		fx: { reverbReturn: 0.2, delayReturn: 0.1, delayTime: 2, delayAnalog: true },
		swing: 1,
		swingGrid: 8,
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X.....x.X.....x." },
				{ voice: "snare", cells: "....X.......X..." },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x.x.x." },
				{ voice: "ride", cells: "x.x.x.x.x.x.x.x.", level: 0.4 },
			],
		],
	},
	// ---- Other meters ----
	{
		id: "waltz",
		name: "Waltz",
		style: "Other meters",
		bpm: 132,
		fx: { reverbReturn: 0.4 },
		meter: "3/4",
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X..........." },
				{ voice: "snare", cells: "....x...x...", level: 0.6 },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x." },
				{ voice: "ride", cells: "....x...x...", level: 0.4 },
			],
		],
	},
	{
		id: "six-eight",
		name: "6/8 ballad",
		style: "Other meters",
		bpm: 70,
		fx: { reverbReturn: 0.45, delayReturn: 0.15, delayTime: 6 },
		meter: "6/8",
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X.....x.x..." },
				{ voice: "snare", cells: "......X.....", reverbSend: 0.5 },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x." },
				{ voice: "hat-open", cells: "..........x.", level: 0.4 },
			],
		],
	},
	{
		id: "six-eight-drive",
		name: "6/8 drive",
		style: "Other meters",
		bpm: 96,
		fx: { reverbReturn: 0.25 },
		meter: "6/8",
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X.....X...x.X.....X..x.." },
				{ voice: "snare", cells: "......X...........X....." },
				{ voice: "hat-closed", cells: "xoxoxoxoxoxoxoxoxoxoxoxo" },
				{ voice: "tom-low", cells: ".....................x.o", level: 0.6 },
			],
		],
	},
	// ---- Fills ----
	{
		id: "fill-toms",
		name: "Tom fill",
		style: "Fills",
		bpm: 120,
		fx: { reverbReturn: 0.3 },
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X...x...X...x..." },
				{ voice: "snare", cells: "....X.......X..." },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x.x.x." },
			],
			[
				{ voice: "kick", cells: "X...x...X......." },
				{ voice: "snare", cells: "....X...xxxx...." },
				{ voice: "hat-closed", cells: "x.x.x.x........." },
				{ voice: "tom-high", cells: "............xx.." },
				{ voice: "tom-low", cells: "..............xx" },
				{ voice: "crash", cells: "................" },
			],
		],
	},
	{
		id: "fill-snare-roll",
		name: "Snare roll into a crash",
		style: "Fills",
		bpm: 120,
		fx: { reverbReturn: 0.35 },
		kit: "acoustic",
		patterns: [
			[
				{ voice: "kick", cells: "X...x...X...x..." },
				{ voice: "snare", cells: "....X.......X..." },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x.x.x." },
			],
			[
				{ voice: "kick", cells: "X...x...X.......", level: 0.9 },
				{ voice: "snare", cells: "....X...oxoxoXoX" },
				{ voice: "hat-closed", cells: "x.x.x.x........." },
			],
			[
				{ voice: "kick", cells: "X...x...X...x..." },
				{ voice: "snare", cells: "....X.......X..." },
				{ voice: "hat-closed", cells: "x.x.x.x.x.x.x.x." },
				{ voice: "crash", cells: "X...............", level: 0.6 },
			],
		],
	},
];
