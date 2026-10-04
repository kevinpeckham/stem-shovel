/**
 * How late swing pushes an arpeggiator step, in seconds: every second
 * step (the odd ones) lands late by up to a third of a step, so full
 * swing is a triplet feel, like the drum machine's (drumSwingDelay).
 * Quarter notes and triplets have nothing to swing and never move.
 */
export function arpSwingDelay(
	step: number,
	stepSeconds: number,
	swing: number,
	perBeat: number,
): number {
	if (perBeat !== 2 && perBeat !== 4) return 0;
	return step % 2 === 1 ? (swing * stepSeconds) / 3 : 0;
}
