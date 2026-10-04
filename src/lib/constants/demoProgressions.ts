import type { ChordVoicing, Strum } from "./circleOfFifths";
import type { PianoInstrumentId } from "./piano";
import type { TempoRatio } from "./tempo";
import type { AutoStrumPatternId, AutoStrumSpeed } from "./autoStrum";

/**
 * Progressions to learn from and to hear played (docs/chord-player.md,
 * "Learn mode"): traditional and public-domain tunes and the stock
 * progressions, written by degree so they land in whatever key the circle
 * is turned to. `fifths` is the chord root's distance from the key
 * clockwise in fifths (0 = I, 1 = V, 11 = IV, 2 = II, 3 = VI, 4 = III,
 * 5 = VII, 7 = ♭II, 9 = ♭III, 8 = ♭VI, 10 = ♭VII); a minor chord sits on
 * the inner ring at its own root (vi is fifths 3, minor).
 */
export interface DemoChord {
	fifths: number;
	quality: "major" | "minor";
	beats: 1 | 2 | 4;
	/** A seventh on this chord, as the 7 pad would give. */
	seventh?: boolean;
}
/**
 * How a demo wants the player set when it loads (Kevin): the sound, the
 * style, the voicing, the strum, the arpeggiator, the key, the octave,
 * the sustain pedal and a few effect levels; whatever it leaves out stays
 * as the player has it. The key is a circle index (0 = C, 1 = G, 2 = D,
 * 4 = E, 11 = F).
 */
export interface DemoSetup {
	mode?: "chords" | "notes";
	instrument?: PianoInstrumentId;
	style?: string;
	voicing?: ChordVoicing;
	strum?: Strum;
	strumDirection?: "down" | "up" | "alternate";
	arp?: {
		on: boolean;
		rate?: "4" | "8" | "8t" | "16";
		pattern?: "up" | "down" | "updown" | "played" | "random";
		octaves?: number;
		gate?: number;
		latch?: boolean;
		swing?: number;
		ratio?: TempoRatio;
	};
	/** The pattern a held wedge strums in while the strum is on (constants/autoStrum.ts); "once" is the plain strum. */
	strumPattern?: AutoStrumPatternId;
	strumSpeed?: AutoStrumSpeed;
	keyCenter?: number;
	octave?: number;
	sustain?: boolean;
	effects?: { reverb?: number; reverbSize?: number; delayLevel?: number; chorusMix?: number };
}
export interface DemoProgression {
	id: string;
	name: string;
	hint: string;
	bpm: number;
	beatsPerBar: number;
	chords: DemoChord[];
	setup?: DemoSetup;
}
const M = (fifths: number, beats: 1 | 2 | 4 = 4, seventh = false): DemoChord => ({
	fifths,
	quality: "major",
	beats,
	seventh,
});
const m = (fifths: number, beats: 1 | 2 | 4 = 4, seventh = false): DemoChord => ({
	fifths,
	quality: "minor",
	beats,
	seventh,
});
const I = 0;
const V = 1;
const IV = 11;
const II = 2;
const VI = 3;
const III = 4;
const VII = 5;
const bVII = 10;
const bVI = 8;
const bIII = 9;

export const DEMO_PROGRESSIONS: DemoProgression[] = [
	{
		id: "pop",
		name: "I–V–vi–IV",
		hint: "the four chords under half of pop",
		bpm: 100,
		beatsPerBar: 4,
		chords: [M(I), M(V), m(VI), M(IV)],
		setup: {
			instrument: "grand",
			style: "plain",
			voicing: "spread",
			strum: "off",
			arp: { on: false },
			keyCenter: 0,
			octave: 4,
			sustain: true,
			effects: { reverb: 0.4 },
		},
	},
	{
		id: "fifties",
		name: "I–vi–IV–V",
		hint: "the doo-wop turnaround",
		bpm: 110,
		beatsPerBar: 4,
		chords: [M(I, 2), m(VI, 2), M(IV, 2), M(V, 2)],
		setup: {
			instrument: "epiano",
			style: "honkytonk",
			voicing: "standard",
			strum: "medium",
			strumDirection: "down",
			strumPattern: "once",
			arp: { on: false },
			keyCenter: 0,
			octave: 4,
			sustain: false,
			effects: { reverb: 0.45, chorusMix: 0.2 },
		},
	},
	{
		id: "two-five-one",
		name: "ii–V–I",
		hint: "the jazz cadence, best in the Jazz style",
		bpm: 120,
		beatsPerBar: 4,
		chords: [m(II, 4, true), M(V, 4, true), M(I, 4, true), M(I, 4, true)],
		setup: {
			instrument: "epiano",
			style: "jazz",
			voicing: "rich",
			strum: "slow",
			strumDirection: "down",
			strumPattern: "once",
			arp: { on: false },
			keyCenter: 11,
			octave: 4,
			sustain: true,
			effects: { reverb: 0.35 },
		},
	},
	{
		id: "blues",
		name: "12-bar blues",
		hint: "I, IV and V over twelve bars; try the Blues style",
		bpm: 96,
		beatsPerBar: 4,
		chords: [M(I), M(I), M(I), M(I), M(IV), M(IV), M(I), M(I), M(V), M(IV), M(I), M(V)],
		setup: {
			instrument: "grand",
			style: "blues",
			voicing: "bass",
			strum: "off",
			arp: { on: false },
			keyCenter: 4,
			octave: 4,
			sustain: false,
			effects: { reverb: 0.25 },
		},
	},
	{
		id: "canon",
		name: "Pachelbel's Canon",
		hint: "I–V–vi–iii–IV–I–IV–V, the round that never ends",
		bpm: 72,
		beatsPerBar: 4,
		chords: [M(I, 2), M(V, 2), m(VI, 2), m(III, 2), M(IV, 2), M(I, 2), M(IV, 2), M(V, 2)],
		setup: {
			instrument: "grand",
			style: "plain",
			voicing: "spread",
			strum: "off",
			arp: { on: true, rate: "8", pattern: "up", octaves: 2, gate: 0.9, latch: false, swing: 0 },
			keyCenter: 2,
			octave: 4,
			sustain: true,
			effects: { reverb: 0.6, reverbSize: 0.7 },
		},
	},
	{
		id: "andalusian",
		name: "Andalusian cadence",
		hint: "vi–V–IV–III, the flamenco fall (play it from the vi)",
		bpm: 90,
		beatsPerBar: 4,
		chords: [m(VI), M(V), M(IV), M(III)],
		setup: {
			instrument: "guitar",
			style: "minor",
			voicing: "standard",
			strum: "fast",
			strumDirection: "alternate",
			strumPattern: "once",
			arp: { on: false },
			keyCenter: 0,
			octave: 3,
			sustain: false,
			effects: { reverb: 0.35 },
		},
	},
	{
		id: "rising-sun",
		name: "House of the Rising Sun",
		hint: "the traditional ballad's turn, in the relative minor",
		bpm: 76,
		beatsPerBar: 3,
		chords: [m(VI, 2), M(I, 1), M(II, 2), M(IV, 1), m(VI, 2), M(I, 1), M(III, 2), M(III, 1)],
		setup: {
			instrument: "guitar",
			style: "minor",
			voicing: "rootBass",
			strum: "off",
			arp: { on: true, rate: "8", pattern: "up", octaves: 1, gate: 0.95, latch: false, swing: 0 },
			keyCenter: 0,
			octave: 3,
			sustain: false,
			effects: { reverb: 0.4 },
		},
	},
	{
		id: "amazing-grace",
		name: "Amazing Grace",
		hint: "I–IV–I–V and home, in three",
		bpm: 70,
		beatsPerBar: 3,
		chords: [
			M(I, 2),
			M(IV, 1),
			M(I, 2),
			M(I, 1),
			M(I, 2),
			M(V, 1),
			M(V, 2),
			M(V, 1),
			M(I, 2),
			M(IV, 1),
			M(I, 2),
			M(V, 1),
			M(I, 2),
			M(I, 1),
		],
		setup: {
			instrument: "guitar",
			style: "folk",
			voicing: "standard",
			strum: "slow",
			strumDirection: "down",
			arp: { on: false },
			strumPattern: "waltz",
			strumSpeed: "8",
			keyCenter: 1,
			octave: 3,
			sustain: false,
			effects: { reverb: 0.5 },
		},
	},
	{
		id: "saints",
		name: "When the Saints Go Marching In",
		hint: "I and V with a turn through IV",
		bpm: 120,
		beatsPerBar: 4,
		chords: [M(I), M(I), M(I), M(V), M(V), M(I), M(I, 4, true), M(IV), M(IV), M(I), M(V), M(I)],
		setup: {
			instrument: "grand",
			style: "ragtime",
			voicing: "bass",
			strum: "off",
			arp: { on: false },
			keyCenter: 11,
			octave: 4,
			sustain: false,
			effects: { reverb: 0.2 },
		},
	},
	{
		id: "greensleeves",
		name: "Greensleeves",
		hint: "the minor's VII and V, in three",
		bpm: 84,
		beatsPerBar: 3,
		chords: [m(VI), M(V), m(VI), M(III), m(VI), M(V), M(III), M(III)],
		setup: {
			instrument: "guitar",
			style: "minor",
			voicing: "standard",
			strum: "slow",
			strumDirection: "down",
			strumPattern: "once",
			arp: { on: false },
			keyCenter: 0,
			octave: 3,
			sustain: false,
			effects: { reverb: 0.45 },
		},
	},
	{
		id: "mixolydian",
		name: "I–♭VII–IV",
		hint: "the rock and folk lift through the borrowed VII",
		bpm: 110,
		beatsPerBar: 4,
		chords: [M(I), M(bVII), M(IV), M(I)],
		setup: {
			instrument: "guitar",
			style: "folk",
			voicing: "standard",
			strum: "medium",
			strumDirection: "alternate",
			arp: { on: false },
			strumPattern: "folk",
			strumSpeed: "8",
			keyCenter: 2,
			octave: 3,
			sustain: false,
			effects: { reverb: 0.3 },
		},
	},
	{
		id: "minor-pop",
		name: "vi–IV–I–V",
		hint: "the pop four from the minor side",
		bpm: 100,
		beatsPerBar: 4,
		chords: [m(VI), M(IV), M(I), M(V)],
		setup: {
			instrument: "pad",
			style: "plain",
			voicing: "spread",
			strum: "off",
			arp: { on: false },
			keyCenter: 0,
			octave: 4,
			sustain: true,
			effects: { reverb: 0.55, reverbSize: 0.6 },
		},
	},
	{
		id: "royal-road",
		name: "IV–V–iii–vi",
		hint: "the royal road, a J-pop staple",
		bpm: 120,
		beatsPerBar: 4,
		chords: [M(IV, 4, true), M(V, 4, true), m(III, 4, true), m(VI)],
		setup: {
			instrument: "epiano",
			style: "jazz",
			voicing: "rich",
			strum: "off",
			arp: { on: false },
			keyCenter: 0,
			octave: 4,
			sustain: true,
			effects: { reverb: 0.4, chorusMix: 0.25 },
		},
	},
	{
		id: "borrowed",
		name: "I–♭VI–♭VII–I",
		hint: "the epic borrowed chords, from the parallel minor",
		bpm: 96,
		beatsPerBar: 4,
		chords: [M(I), M(bVI), M(bVII), M(I)],
		setup: {
			instrument: "synth",
			style: "fifths",
			voicing: "standard",
			strum: "off",
			arp: { on: false },
			keyCenter: 0,
			octave: 3,
			sustain: false,
			effects: { reverb: 0.5, delayLevel: 0.2 },
		},
	},
	{
		id: "jazz-turnaround",
		name: "I–vi–ii–V turnaround",
		hint: "the jazz turnaround, round the circle home, in the Bebop style",
		bpm: 132,
		beatsPerBar: 4,
		chords: [M(I, 2), m(VI, 2), m(II, 2), M(V, 2), M(I, 2), m(VI, 2), m(II, 2), M(V, 2)],
		setup: {
			instrument: "grand",
			style: "bebop",
			voicing: "rich",
			strum: "off",
			arp: { on: false },
			keyCenter: 10,
			octave: 4,
			sustain: false,
			effects: { reverb: 0.3 },
		},
	},
	{
		id: "three-six-two-five",
		name: "iii–vi–ii–V",
		hint: "the turnaround from the iii, cooler, each chord a fifth down",
		bpm: 126,
		beatsPerBar: 4,
		chords: [m(III, 2), m(VI, 2), m(II, 2), M(V, 2), m(III, 2), m(VI, 2), m(II, 2), M(V, 2)],
		setup: {
			instrument: "epiano",
			style: "cool",
			voicing: "rich",
			strum: "off",
			arp: { on: false },
			keyCenter: 11,
			octave: 4,
			sustain: false,
			effects: { reverb: 0.35 },
		},
	},
	{
		id: "minor-two-five",
		name: "Minor ii–V–i",
		hint: "m7♭5, an altered V and home in the minor (play it from the vi)",
		bpm: 112,
		beatsPerBar: 4,
		chords: [m(VII), M(III), m(VI), m(VI)],
		setup: {
			instrument: "grand",
			style: "bebop",
			voicing: "rich",
			strum: "off",
			arp: { on: false },
			keyCenter: 0,
			octave: 4,
			sustain: false,
			effects: { reverb: 0.3 },
		},
	},
	{
		id: "jazz-blues",
		name: "Jazz blues",
		hint: "the twelve bars with the VI7 and a ii–V home, in F",
		bpm: 138,
		beatsPerBar: 4,
		chords: [
			M(I),
			M(IV),
			M(I),
			M(I),
			M(IV),
			M(IV),
			M(I),
			M(VI),
			m(II),
			M(V),
			M(I, 2),
			M(VI, 2),
			m(II, 2),
			M(V, 2),
		],
		setup: {
			instrument: "grand",
			style: "blues",
			voicing: "bass",
			strum: "off",
			arp: { on: false },
			keyCenter: 11,
			octave: 4,
			sustain: false,
			effects: { reverb: 0.25 },
		},
	},
	{
		id: "rhythm-changes",
		name: "Rhythm changes (A)",
		hint: "the A section of I Got Rhythm, with the iv on the way home",
		bpm: 160,
		beatsPerBar: 4,
		chords: [
			M(I, 2),
			m(VI, 2),
			m(II, 2),
			M(V, 2),
			M(I, 2),
			m(VI, 2),
			m(II, 2),
			M(V, 2),
			M(I, 2),
			M(I, 2, true),
			M(IV, 2),
			m(IV, 2),
			M(I, 2),
			M(V, 2),
			M(I, 4),
		],
		setup: {
			instrument: "grand",
			style: "bebop",
			voicing: "standard",
			strum: "off",
			arp: { on: false },
			keyCenter: 10,
			octave: 4,
			sustain: false,
			effects: { reverb: 0.25 },
		},
	},
	{
		id: "backdoor-cadence",
		name: "Backdoor ii–V",
		hint: "iv and ♭VII7 instead of ii and V: in through the back door",
		bpm: 104,
		beatsPerBar: 4,
		chords: [M(I), m(IV), M(bVII), M(I)],
		setup: {
			instrument: "epiano",
			style: "cool",
			voicing: "rich",
			strum: "off",
			arp: { on: false },
			keyCenter: 9,
			octave: 4,
			sustain: true,
			effects: { reverb: 0.4 },
		},
	},
	{
		id: "descending-two-fives",
		name: "Descending ii–Vs",
		hint: "iii–VI, ii–V, I: the ii–Vs step down a tone to home",
		bpm: 120,
		beatsPerBar: 4,
		chords: [m(III, 2), M(VI, 2), m(II, 2), M(V, 2), M(I, 4), M(I, 4)],
		setup: {
			instrument: "grand",
			style: "bebop",
			voicing: "rich",
			strum: "off",
			arp: { on: false },
			keyCenter: 9,
			octave: 4,
			sustain: false,
			effects: { reverb: 0.3 },
		},
	},
	{
		id: "backdoor",
		name: "I–♭III–♭VII–IV",
		hint: "the back door home, a sixties turn",
		bpm: 104,
		beatsPerBar: 4,
		chords: [M(I), M(bIII), M(bVII), M(IV)],
		setup: {
			instrument: "organ",
			style: "plain",
			voicing: "rootBass",
			strum: "off",
			arp: { on: false },
			keyCenter: 0,
			octave: 4,
			sustain: false,
			effects: { reverb: 0.3 },
		},
	},
];
