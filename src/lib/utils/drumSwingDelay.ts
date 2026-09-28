/**
 * How late swing pushes a step, in seconds: every second sixteenth (the
 * odd steps) lands late by up to a third of a step, so full swing is a
 * triplet feel, the top of an MPC's range. Steps on the eighths (even
 * steps) never move, which is why a pattern with nothing on the odd
 * sixteenths sounds the same at any swing. The one rule behind the live
 * engine, the WAV render and the MIDI file.
 */
export function drumSwingDelay(step: number, stepSeconds: number, swing: number): number {
	return step % 2 === 1 ? (swing * stepSeconds) / 3 : 0;
}
