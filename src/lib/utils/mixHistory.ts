/**
 * Undo for mix moves (docs/visual-mixer.md, "Undo"): a stack of snapshots
 * where one step is one gesture, not one event. A drag, a knob turn or a
 * held arrow key sends a stream of changes; `remember` takes a snapshot
 * only when the stream has paused longer than `gap` since the last
 * change, so the snapshot is the state before the gesture began. Both
 * engines keep one of these (the stem player's over its faders, pans,
 * mutes, solos and master; Dawn's over its arrangement).
 */
export class MixHistory<T> {
	#past: T[] = [];
	#future: T[] = [];
	#lastAt = -Infinity;
	readonly #gap: number;
	readonly #depth: number;

	constructor(gap = 400, depth = 100) {
		this.#gap = gap;
		this.#depth = depth;
	}

	get canUndo(): boolean {
		return this.#past.length > 0;
	}
	get canRedo(): boolean {
		return this.#future.length > 0;
	}

	/**
	 * Call before every change with the current state as a thunk (it is
	 * only taken at a gesture's start). Returns true when a step was kept.
	 */
	remember(current: () => T, now: number): boolean {
		const fresh = now - this.#lastAt > this.#gap;
		this.#lastAt = now;
		if (!fresh) return false;
		this.#past.push(current());
		if (this.#past.length > this.#depth) this.#past.shift();
		this.#future = [];
		return true;
	}

	/** The state to restore, with the current one kept for redo; null when there is nothing to undo. */
	undo(current: () => T): T | null {
		const prev = this.#past.pop();
		if (prev === undefined) return null;
		this.#future.push(current());
		this.#lastAt = -Infinity;
		return prev;
	}

	redo(current: () => T): T | null {
		const next = this.#future.pop();
		if (next === undefined) return null;
		this.#past.push(current());
		this.#lastAt = -Infinity;
		return next;
	}

	clear(): void {
		this.#past = [];
		this.#future = [];
		this.#lastAt = -Infinity;
	}
}
