/**
 * When a step sounds, in seconds from the start of the pattern: sixteenths
 * at the tempo, with swing pushing every second sixteenth late by up to a
 * third of a step (full swing is a triplet feel, the top of an MPC's range).
 */
export function drumStepTime(step: number, bpm: number, swing: number): number {
	const stepSeconds = 60 / bpm / 4;
	const late = step % 2 === 1 ? (swing * stepSeconds) / 3 : 0;
	return step * stepSeconds + late;
}
