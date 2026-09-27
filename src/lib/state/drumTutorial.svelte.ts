import { TUTORIAL_STEPS, type TutorialControl } from "$lib/constants/drumTutorial";

/**
 * Where the drum machine's walk-through stands: on or off, which step,
 * and whether the person has pressed Play. The panel drives it; the
 * device reads it to highlight the cells and the control the step points
 * at (docs/drum-machine.md).
 */
class DrumTutorialState {
	active = $state(false);
	index = $state(0);
	played = $state(false);

	get step() {
		return TUTORIAL_STEPS[this.index] ?? TUTORIAL_STEPS[0]!;
	}
	get last() {
		return this.index >= TUTORIAL_STEPS.length - 1;
	}
	/** "voice:step" for every cell the current step points at, in the pattern it names. */
	get hints(): { pattern: number; cells: Set<string> } | null {
		if (!this.active || !this.step.cells) return null;
		const cells = new Set<string>();
		let pattern = 0;
		for (const w of this.step.cells) {
			pattern = w.pattern ?? 0;
			for (const s of w.steps) cells.add(`${w.voice}:${s}`);
		}
		return { pattern, cells };
	}
	get control(): TutorialControl | null {
		return this.active ? (this.step.control ?? null) : null;
	}

	start() {
		this.active = true;
		this.index = 0;
		this.played = false;
	}
	next() {
		if (!this.last) this.index += 1;
	}
	back() {
		if (this.index > 0) this.index -= 1;
	}
	stop() {
		this.active = false;
	}
}

export const drumTutorial = new DrumTutorialState();
