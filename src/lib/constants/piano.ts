/**
 * The piano (docs/piano.md): a keyboard instrument played from the screen,
 * the computer keyboard or a MIDI controller, with a handful of synthesized
 * sounds (no samples yet). These are its fixed choices.
 */
export const PIANO_INSTRUMENTS = [
	{ id: "epiano", label: "Electric Piano", hint: "a bell-like tine, soft and round" },
	{ id: "organ", label: "Organ", hint: "drawbars, holds as long as you do" },
	{
		id: "synth",
		label: "Synth Lead",
		hint: "two saws and a sub, a filter that opens with velocity",
	},
	{ id: "pad", label: "Pad", hint: "slow to swell, slow to fade" },
	{ id: "pluck", label: "Pluck", hint: "a short, bright pick" },
] as const;
export type PianoInstrumentId = (typeof PIANO_INSTRUMENTS)[number]["id"];
export const PIANO_INSTRUMENT_IDS = PIANO_INSTRUMENTS.map((i) => i.id) as PianoInstrumentId[];

/** The octave the on-screen keyboard starts at (C of that octave, so 4 = middle C's octave). */
export const PIANO_OCTAVE_MIN = 1;
export const PIANO_OCTAVE_MAX = 6;
export const DEFAULT_PIANO_OCTAVE = 3;

/** Voices sounding at once; the oldest is let go beyond it. */
export const PIANO_MAX_VOICES = 24;

/**
 * The computer keyboard as two rows of piano keys, by physical key (KeyboardEvent.code,
 * so any layout plays where the keys are): the bottom row from Z is the
 * keyboard's first octave, the row from Q the octave above, each with its
 * sharps on the row above it, the way most software instruments do it.
 * The value is semitones above the keyboard's lowest C.
 */
export const PIANO_KEY_CODES: Record<string, number> = {
	KeyZ: 0,
	KeyS: 1,
	KeyX: 2,
	KeyD: 3,
	KeyC: 4,
	KeyV: 5,
	KeyG: 6,
	KeyB: 7,
	KeyH: 8,
	KeyN: 9,
	KeyJ: 10,
	KeyM: 11,
	Comma: 12,
	KeyL: 13,
	Period: 14,
	Semicolon: 15,
	Slash: 16,
	KeyQ: 12,
	Digit2: 13,
	KeyW: 14,
	Digit3: 15,
	KeyE: 16,
	KeyR: 17,
	Digit5: 18,
	KeyT: 19,
	Digit6: 20,
	KeyY: 21,
	Digit7: 22,
	KeyU: 23,
	KeyI: 24,
	Digit9: 25,
	KeyO: 26,
	Digit0: 27,
	KeyP: 28,
	BracketLeft: 29,
	Equal: 30,
	BracketRight: 31,
};

/** The label printed on a key for a semitone above the lowest C (the bottom row's key for the first octave, the top row's above), QWERTY spellings. */
export const PIANO_KEY_LABELS: Record<number, string> = {
	0: "Z",
	1: "S",
	2: "X",
	3: "D",
	4: "C",
	5: "V",
	6: "G",
	7: "B",
	8: "H",
	9: "N",
	10: "J",
	11: "M",
	12: "Q",
	13: "2",
	14: "W",
	15: "3",
	16: "E",
	17: "R",
	18: "5",
	19: "T",
	20: "6",
	21: "Y",
	22: "7",
	23: "U",
	24: "I",
	25: "9",
	26: "O",
	27: "0",
	28: "P",
	29: "[",
	30: "=",
	31: "]",
};

/** Semitones within an octave that are black keys. */
export const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
