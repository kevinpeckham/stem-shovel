import type { DrumFx } from "../val/DrumPatternSchema";
import type { DrumKitId, DrumVoiceId } from "./drumMachine";

/**
 * The pattern generator's styles (docs/drum-machine.md, "Pattern
 * generator"): for each, a bar of 4/4 as sixteen characters per voice,
 * and a bar of 6/8 as twelve. `X`, `x` and `o` are the backbone, always
 * there (an accent, a hit, a ghost); a digit is a maybe, its tenths the
 * chance of a hit at the middle density (the density slider halves or
 * doubles it); `.` is never. `ghosts` are maybes that come out as ghost
 * notes. `generateDrumPattern` draws a pattern from these; three-four
 * takes the first three beats of the 4/4 bar, and two-bar patterns draw
 * each bar on its own, so no two bars are the same.
 */
export interface DrumGeneratorRow {
	voice: DrumVoiceId;
	hits: string;
	ghosts?: string;
}
export interface DrumGeneratorStyle {
	id: string;
	name: string;
	/** A word on what it does, for the menu. */
	hint: string;
	/** The effects a generated beat of this style arrives with, over the defaults (the master levels start at zero; these raise what suits the style). */
	fx?: Partial<DrumFx>;
	/** The feel it arrives with: swing 0 to 1 (straight when absent) and humanize 0 to 1 (the usual amount when absent). */
	swing?: number;
	humanize?: number;
	/** The kit the style is written for ("acoustic" or "electronic"; the fill names none and keeps the kit in use). */
	kit?: DrumKitId;
	four: DrumGeneratorRow[];
	six: DrumGeneratorRow[];
}

/** The 6/8 bars share a shape: the styles differ in the maybes. */
const SIX_PLAIN: DrumGeneratorRow[] = [
	{ voice: "kick", hits: "X..2..x..3.." },
	{ voice: "snare", hits: "......X.....", ghosts: "...2.....3.." },
	{ voice: "hat-closed", hits: "x3x3x3x3x3x3" },
	{ voice: "hat-open", hits: "...........3" },
];
const SIX_BUSY: DrumGeneratorRow[] = [
	{ voice: "kick", hits: "X.4.4.x.4.4." },
	{ voice: "snare", hits: "......X.....", ghosts: "..4..4...4.4" },
	{ voice: "hat-closed", hits: "x5x5x5x5x5x5" },
	{ voice: "hat-open", hits: ".....3.....4" },
	{ voice: "tom-low", hits: "........3..3" },
];

export const DRUM_GENERATOR_STYLES: DrumGeneratorStyle[] = [
	{
		id: "rock",
		name: "Rock",
		hint: "kick on 1 and 3, snare on 2 and 4, hats on the eighths",
		fx: { reverbReturn: 0.2 },
		swing: 0,
		kit: "acoustic",
		humanize: 0.14,
		four: [
			{ voice: "kick", hits: "X..2..6.x.5...4." },
			{ voice: "snare", hits: "....X.......X...", ghosts: "..2....3...2..3." },
			{ voice: "hat-closed", hits: "x4x4x4x4x4x4x4x4" },
			{ voice: "hat-open", hits: "......3........4" },
			{ voice: "crash", hits: "2..............." },
		],
		six: SIX_PLAIN,
	},
	{
		id: "pop",
		name: "Pop",
		hint: "a steady backbeat with a clap now and then",
		fx: { reverbReturn: 0.25, delayReturn: 0.15, toneAir: 0.15 },
		swing: 0,
		kit: "acoustic",
		humanize: 0.1,
		four: [
			{ voice: "kick", hits: "X...4...x..5...." },
			{ voice: "snare", hits: "....X.......X...", ghosts: "..............2." },
			{ voice: "clap", hits: "....5.......5..." },
			{ voice: "hat-closed", hits: "x3x3x3x3x3x3x3x3" },
			{ voice: "hat-open", hits: "..............4." },
		],
		six: SIX_PLAIN,
	},
	{
		id: "funk",
		name: "Funk",
		hint: "syncopated kicks, snare ghosts, sixteenth hats",
		fx: { reverbReturn: 0.1, toneAir: 0.1 },
		swing: 0.2,
		kit: "acoustic",
		humanize: 0.2,
		four: [
			{ voice: "kick", hits: "X..4..5.x.3..4.." },
			{ voice: "snare", hits: "....X..2..3.X..3", ghosts: "..3..2....3...2." },
			{ voice: "hat-closed", hits: "x5x4x5x4x5x4x5x4" },
			{ voice: "hat-open", hits: "......4.......4." },
		],
		six: SIX_BUSY,
	},
	{
		id: "hip-hop",
		name: "Hip-hop",
		hint: "a lazy kick, the snare doubled by a clap",
		fx: { reverbReturn: 0.15, toneBottom: 0.4 },
		swing: 0.25,
		kit: "electronic",
		humanize: 0.18,
		four: [
			{ voice: "kick", hits: "X..3....x.4..3.." },
			{ voice: "snare", hits: "....X.......X...", ghosts: "...........3...." },
			{ voice: "clap", hits: "....6.......6..." },
			{ voice: "hat-closed", hits: "x2x2x5x2x2x2x5x2" },
			{ voice: "hat-open", hits: "..............3." },
		],
		six: SIX_PLAIN,
	},
	{
		id: "house",
		name: "House",
		hint: "four on the floor, open hats on the off-beats",
		fx: { delayReturn: 0.2, delayTime: 3, reverbReturn: 0.15, toneBottom: 0.4 },
		swing: 0.1,
		kit: "electronic",
		humanize: 0.05,
		four: [
			{ voice: "kick", hits: "X...x...x...x..." },
			{ voice: "clap", hits: "....x.......x..." },
			{ voice: "hat-closed", hits: "x.5.x.5.x.5.x.5." },
			{ voice: "hat-open", hits: "..8...8...8...8." },
			{ voice: "rim", hits: "...3......3....." },
		],
		six: SIX_BUSY,
	},
	{
		id: "breakbeat",
		name: "Breakbeat",
		hint: "a broken kick under sixteenth hats, for the fast tempos",
		fx: { reverbReturn: 0.3, toneBottom: 0.2 },
		swing: 0.15,
		kit: "acoustic",
		humanize: 0.15,
		four: [
			{ voice: "kick", hits: "X.....x...5....4" },
			{ voice: "snare", hits: "....X.......X...", ghosts: ".......4..3....3" },
			{ voice: "hat-closed", hits: "x5x5x5x5x5x5x5x5" },
			{ voice: "ride", hits: "3...3...3...3..." },
		],
		six: SIX_BUSY,
	},
	{
		id: "latin",
		name: "Latin",
		hint: "a clave on the rim, a cowbell, toms in the gaps",
		fx: { reverbReturn: 0.2 },
		swing: 0,
		kit: "acoustic",
		humanize: 0.12,
		four: [
			{ voice: "kick", hits: "X..3..x...x..3.." },
			{ voice: "rim", hits: "x..x..x...x.x..." },
			{ voice: "cowbell", hits: "x.4.x.4.x.4.x.4." },
			{ voice: "hat-closed", hits: "x.x.x.x.x.x.x.x." },
			{ voice: "tom-low", hits: "..3.....4...3..." },
			{ voice: "tom-high", hits: ".....3.......4.." },
		],
		six: SIX_BUSY,
	},
	{
		id: "half-time",
		name: "Half-time",
		hint: "the snare on 3 alone, room to breathe",
		fx: { reverbReturn: 0.4, delayReturn: 0.15, delayTime: 6, toneBottom: 0.3 },
		swing: 0.1,
		kit: "electronic",
		humanize: 0.2,
		four: [
			{ voice: "kick", hits: "X.....4...4.5..." },
			{ voice: "snare", hits: "........X.......", ghosts: "....2.......3.2." },
			{ voice: "hat-closed", hits: "x3x3x3x3x3x3x3x3" },
			{ voice: "hat-open", hits: "..............4." },
		],
		six: SIX_PLAIN,
	},
	{
		id: "fill",
		name: "Fill",
		hint: "half a bar of beat, then the snare and toms build up to the top",
		fx: { reverbReturn: 0.3 },
		swing: 0,
		humanize: 0.14,
		four: [
			{ voice: "kick", hits: "X.......x......." },
			{ voice: "snare", hits: "....X...4.6.8xXX", ghosts: "........2.2....." },
			{ voice: "hat-closed", hits: "x.x.x.x........." },
			{ voice: "tom-low", hits: "........3...6.5." },
			{ voice: "tom-high", hits: "..........5..6.." },
		],
		six: [
			{ voice: "kick", hits: "X..........." },
			{ voice: "snare", hits: "......X.6xXX" },
			{ voice: "hat-closed", hits: "x.x.x......." },
			{ voice: "tom-low", hits: ".......5.5.." },
		],
	},
];
export type DrumGeneratorStyleId = (typeof DRUM_GENERATOR_STYLES)[number]["id"];
