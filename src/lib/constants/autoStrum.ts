/**
 * The chord player's strum patterns (docs/chord-player.md, "Strum"): with
 * the strum on, a press strums the chord and holding it strums again and
 * again in a pattern at the session tempo ("Once" strums on the press alone).
 * Each pattern is a bar of slots, an eighth each at the Eighths speed (a
 * sixteenth at Sixteenths): D a down strum, U an up strum, - a rest; the
 * pattern repeats while the chord is held.
 */
export const AUTO_STRUM_PATTERNS = [
	{ id: "once", label: "Once, on the press", slots: "D" },
	{ id: "downs", label: "Down on the beat", slots: "D-D-D-D-" },
	{ id: "downup", label: "Down up", slots: "DUDUDUDU" },
	{ id: "folk", label: "Folk · D DU UDU", slots: "D-DU-UDU" },
	{ id: "country", label: "Country · D DU DU", slots: "D-D-DUDU" },
	{ id: "island", label: "Island · D DU U UDU", slots: "D-DUU-DU" },
	{ id: "waltz", label: "Waltz · D DU DU", slots: "D-DUDU" },
	{ id: "eighths", label: "Driving eighths", slots: "DDDDDDDD" },
] as const;
export type AutoStrumPatternId = (typeof AUTO_STRUM_PATTERNS)[number]["id"];
export const AUTO_STRUM_SPEEDS = [
	{ id: "8", label: "Eighths", perBeat: 2 },
	{ id: "16", label: "Sixteenths", perBeat: 4 },
] as const;
export type AutoStrumSpeed = (typeof AUTO_STRUM_SPEEDS)[number]["id"];
