/**
 * When a chord pressed while the arpeggiator runs takes over the pattern
 * (docs/chord-player.md, "The arpeggiator"): the grid keeps running and
 * the new chord joins it at the next change point, a quarter in
 * eighth-note mode, an eighth in sixteenths, a beat in triplets, every
 * step in quarters. Pressed just before a change point, the chord waits
 * for it and lands exactly on it; pressed just after one (within the
 * grace), it comes in on the very next step at that step's place in the
 * pattern, so the notes after it are not late. `step` is the step the
 * press fell in (steps from the grid's origin, fractional), `changeSteps`
 * the change point's spacing in steps, `grace` likewise in steps.
 */
export function arpSwitchStep(step: number, changeSteps: number, grace: number): number {
	const current = Math.floor(step);
	const lastChange = Math.floor(current / changeSteps) * changeSteps;
	if (step - lastChange <= grace) return current + 1;
	return lastChange + changeSteps;
}

/** The change point's spacing in steps for a rate: quarters change every step, eighths every two (a quarter), triplets every three (a beat), sixteenths every two (an eighth). */
export function arpChangeSteps(rate: string): number {
	switch (rate) {
		case "4":
			return 1;
		case "8t":
			return 3;
		default:
			return 2;
	}
}
