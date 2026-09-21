/** Tunings the tuner offers, low string first, as MIDI notes (E2 = 40, A4 = 69). */
export interface Tuning {
	id: string;
	label: string;
	notes: number[];
}

export const TUNINGS: Tuning[] = [
	{ id: "standard", label: "Guitar · standard (E A D G B E)", notes: [40, 45, 50, 55, 59, 64] },
	{ id: "drop-d", label: "Guitar · drop D (D A D G B E)", notes: [38, 45, 50, 55, 59, 64] },
	{
		id: "half-down",
		label: "Guitar · half step down (E♭ A♭ D♭ G♭ B♭ E♭)",
		notes: [39, 44, 49, 54, 58, 63],
	},
	{ id: "dadgad", label: "Guitar · DADGAD", notes: [38, 45, 50, 55, 57, 62] },
	{ id: "open-g", label: "Guitar · open G (D G D G B D)", notes: [38, 43, 50, 55, 59, 62] },
	{ id: "bass", label: "Bass · standard (E A D G)", notes: [28, 33, 38, 43] },
	{ id: "bass-5", label: "Bass · 5-string (B E A D G)", notes: [23, 28, 33, 38, 43] },
	{ id: "ukulele", label: "Ukulele · standard (G C E A)", notes: [67, 60, 64, 69] },
];

export const DEFAULT_TUNING_ID = "standard";
