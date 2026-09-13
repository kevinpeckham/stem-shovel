import { browser } from "$app/environment";
import { POSITION_MODES, type PositionMode } from "$lib/format";

/**
 * The position format in use — on the transport, in tooltips and in the
 * settings rows alike. Remembered per browser. Bars fall back to time when a
 * song has no tempo or meter.
 */
const KEY = "readout.mode";

function stored(): PositionMode {
	if (!browser) return "time";
	try {
		const v = localStorage.getItem(KEY);
		return (POSITION_MODES as readonly string[]).includes(v ?? "") ? (v as PositionMode) : "time";
	} catch {
		return "time";
	}
}

export const readout = $state({ mode: stored() });

export function setReadoutMode(mode: PositionMode) {
	readout.mode = mode;
	try {
		localStorage.setItem(KEY, mode);
	} catch {
		// private mode etc.
	}
}

/** Time → timecode → bars (when available) → time. */
export function cycleReadoutMode(barsAvailable: boolean) {
	const order = POSITION_MODES.filter((m) => m !== "bars" || barsAvailable);
	const i = order.indexOf(readout.mode);
	setReadoutMode(order[(i + 1) % order.length]);
}
