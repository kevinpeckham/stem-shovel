/**
 * Which note of an arpeggio sequence a step plays (docs/chord-player.md,
 * "The arpeggiator"). With no alignment the sequence simply cycles; lined
 * up with bars, the sequence restarts from its first note at every cycle
 * of `stepsPerCycle` steps (a bar or two of the rate), dropping whatever
 * of the pattern was left, so the pattern lands the same way every bar
 * however many notes the chord and voicing gave it.
 */
export function arpStepIndex(step: number, length: number, stepsPerCycle: number | null): number {
	if (length <= 0) return 0;
	const within = stepsPerCycle && stepsPerCycle > 0 ? step % stepsPerCycle : step;
	return within % length;
}
