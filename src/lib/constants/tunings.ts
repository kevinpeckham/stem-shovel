/** Tunings the tuner offers, low string first, as MIDI notes (E2 = 40, A4 = 69); the chromatic one lists no strings and suits any instrument or tuning. */
export interface Tuning {
	id: string;
	label: string;
	notes: number[];
}

export const TUNINGS: Tuning[] = [
	{ id: "chromatic", label: "Chromatic: Any Instrument", notes: [] },
	{ id: "standard", label: "Guitar - Standard", notes: [40, 45, 50, 55, 59, 64] },
	{ id: "drop-d", label: "Guitar - Drop D", notes: [38, 45, 50, 55, 59, 64] },
	{
		id: "half-down",
		label: "Guitar - 1/2 Step Down",
		notes: [39, 44, 49, 54, 58, 63],
	},
	{ id: "dadgad", label: "Guitar - DADGAD", notes: [38, 45, 50, 55, 57, 62] },
	{ id: "open-g", label: "Guitar - Open G", notes: [38, 43, 50, 55, 59, 62] },
	{ id: "bass", label: "Bass - Standard", notes: [28, 33, 38, 43] },
	{ id: "bass-5", label: "Bass - 5-string", notes: [23, 28, 33, 38, 43] },
	{ id: "ukulele", label: "Ukulele - Standard", notes: [67, 60, 64, 69] },
];

interface ComboBoxOption {
		value: T;
		label: string;
		/** Muted text after the label, "2 takes" or a hint. */
		description?: string;
	}


export const TUNINGS_OPTIONS: ComboBoxOption[] = TUNINGS.map((t) => ({ value: t.id, label: t.label }));

export const DEFAULT_TUNING_ID = "standard";

export const DEFAULT_TUNING_OPTION: ComboBoxOption = TUNINGS_OPTIONS.find((t) => t.value === DEFAULT_TUNING_ID)!;
