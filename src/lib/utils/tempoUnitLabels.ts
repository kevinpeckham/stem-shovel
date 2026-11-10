import { isCompoundMeter } from "./isCompoundMeter.js";

/**
 * The two units a tempo can be counted in under a compound meter: the
 * meter's bottom note (what the song stores: 6/8 at 120 is 120 eighths a
 * minute) and the dotted beat musicians write (40 dotted quarters). Null for
 * a meter that is not compound.
 */
export function tempoUnitLabels(
	meter: string | null | undefined,
): { bottom: string; dotted: string } | null {
	if (!isCompoundMeter(meter)) return null;
	return meter!.trim().endsWith("16")
		? { bottom: "sixteenth notes", dotted: "dotted eighths" }
		: { bottom: "eighth notes", dotted: "dotted quarters" };
}
