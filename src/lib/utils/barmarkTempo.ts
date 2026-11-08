import { beatsOf, parseMeter } from "barmark";

/**
 * A tempo as barmark counts it: SS stores bpm in the meter's bottom-number
 * unit (a 6/8 song at "120" is 120 eighths), barmark in grammar 2.1's beat
 * (the dotted quarter), so the value is scaled by beats / top number. A
 * value or meter that does not read passes as written; the builder says so.
 */
export function barmarkTempo(value: string, meter: string | null): string | number {
	const bpm = Number(value);
	const m = meter ? parseMeter(meter) : null;
	if (!Number.isFinite(bpm) || !m) return value;
	return (bpm * beatsOf(m)) / m.n;
}
