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
export interface DemoProgression {
	id: string;
	name: string;
	hint: string;
	bpm: number;
	beatsPerBar: number;
	chords: DemoChord[];
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
	},
	{
		id: "fifties",
		name: "I–vi–IV–V",
		hint: "the doo-wop turnaround",
		bpm: 110,
		beatsPerBar: 4,
		chords: [M(I, 2), m(VI, 2), M(IV, 2), M(V, 2)],
	},
	{
		id: "two-five-one",
		name: "ii–V–I",
		hint: "the jazz cadence, best in the Jazz style",
		bpm: 120,
		beatsPerBar: 4,
		chords: [m(II, 4, true), M(V, 4, true), M(I, 4, true), M(I, 4, true)],
	},
	{
		id: "blues",
		name: "12-bar blues",
		hint: "I, IV and V over twelve bars; try the Blues style",
		bpm: 96,
		beatsPerBar: 4,
		chords: [M(I), M(I), M(I), M(I), M(IV), M(IV), M(I), M(I), M(V), M(IV), M(I), M(V)],
	},
	{
		id: "canon",
		name: "Pachelbel's Canon",
		hint: "I–V–vi–iii–IV–I–IV–V, the round that never ends",
		bpm: 72,
		beatsPerBar: 4,
		chords: [M(I, 2), M(V, 2), m(VI, 2), m(III, 2), M(IV, 2), M(I, 2), M(IV, 2), M(V, 2)],
	},
	{
		id: "andalusian",
		name: "Andalusian cadence",
		hint: "vi–V–IV–III, the flamenco fall (play it from the vi)",
		bpm: 90,
		beatsPerBar: 4,
		chords: [m(VI), M(V), M(IV), M(III)],
	},
	{
		id: "rising-sun",
		name: "House of the Rising Sun",
		hint: "the traditional ballad's turn, in the relative minor",
		bpm: 76,
		beatsPerBar: 3,
		chords: [m(VI, 2), M(I, 1), M(II, 2), M(IV, 1), m(VI, 2), M(I, 1), M(III, 2), M(III, 1)],
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
	},
	{
		id: "saints",
		name: "When the Saints Go Marching In",
		hint: "I and V with a turn through IV",
		bpm: 120,
		beatsPerBar: 4,
		chords: [M(I), M(I), M(I), M(V), M(V), M(I), M(I, 4, true), M(IV), M(IV), M(I), M(V), M(I)],
	},
	{
		id: "greensleeves",
		name: "Greensleeves",
		hint: "the minor's VII and V, in three",
		bpm: 84,
		beatsPerBar: 3,
		chords: [m(VI), M(V), m(VI), M(III), m(VI), M(V), M(III), M(III)],
	},
	{
		id: "mixolydian",
		name: "I–♭VII–IV",
		hint: "the rock and folk lift through the borrowed VII",
		bpm: 110,
		beatsPerBar: 4,
		chords: [M(I), M(bVII), M(IV), M(I)],
	},
	{
		id: "minor-pop",
		name: "vi–IV–I–V",
		hint: "the pop four from the minor side",
		bpm: 100,
		beatsPerBar: 4,
		chords: [m(VI), M(IV), M(I), M(V)],
	},
	{
		id: "royal-road",
		name: "IV–V–iii–vi",
		hint: "the royal road, a J-pop staple",
		bpm: 120,
		beatsPerBar: 4,
		chords: [M(IV, 4, true), M(V, 4, true), m(III, 4, true), m(VI)],
	},
	{
		id: "borrowed",
		name: "I–♭VI–♭VII–I",
		hint: "the epic borrowed chords, from the parallel minor",
		bpm: 96,
		beatsPerBar: 4,
		chords: [M(I), M(bVI), M(bVII), M(I)],
	},
	{
		id: "backdoor",
		name: "I–♭III–♭VII–IV",
		hint: "the back door home, a sixties turn",
		bpm: 104,
		beatsPerBar: 4,
		chords: [M(I), M(bIII), M(bVII), M(IV)],
	},
];
