import { browser } from "$app/environment";
import { POSITION_MODES, type PositionMode } from "$lib/constants/positionModes";

/**
 * The position format in use — on the transport, in tooltips and in the
 * settings rows alike. Bars by default when the song has a tempo and a
 * meter, timecode otherwise; a click on the readout picks explicitly and is
 * remembered per browser.
 */
const KEY = "readout.mode";

/** The user's explicit choice, or null for automatic. */
function stored(): PositionMode | null {
	if (!browser) return null;
	try {
		const v = localStorage.getItem(KEY);
		return (POSITION_MODES as readonly string[]).includes(v ?? "") ? (v as PositionMode) : null;
	} catch {
		return null;
	}
}

export const readout = $state<{ mode: PositionMode | null }>({ mode: stored() });

/** The mode in effect: the explicit choice, else bars when available, else timecode. */
export function readoutMode(barsAvailable: boolean): PositionMode {
	if (readout.mode === "bars" && !barsAvailable) return "timecode";
	return readout.mode ?? (barsAvailable ? "bars" : "timecode");
}

function setReadoutMode(mode: PositionMode) {
	readout.mode = mode;
	try {
		localStorage.setItem(KEY, mode);
	} catch {
		// private mode etc.
	}
}

/** Timecode ↔ bars (when the song has a tempo and a meter); timecode alone otherwise. */
export function cycleReadoutMode(barsAvailable: boolean) {
	const order = POSITION_MODES.filter((m) => m !== "bars" || barsAvailable);
	const i = order.indexOf(readoutMode(barsAvailable));
	setReadoutMode(order[(i + 1) % order.length]);
}
