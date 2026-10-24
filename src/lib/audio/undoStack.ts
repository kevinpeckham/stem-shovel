import { applyPatch, patchBetween, type Json, type Patch } from "#lib/utils/structuralPatch.js";

/**
 * Undo and redo over whole documents, kept as patches (docs/multitrack-
 * recorder.md "Scale and structure", docs/dawn-daw-plan.md D8). The engine
 * calls `push` with the state before each edit, as it did when it kept a
 * hundred full snapshots; the stack answers the same states back.
 *
 * Each side (undo, redo) holds its newest state whole and every older one
 * as the patch from its successor (utils/structuralPatch.ts). The newest
 * stays whole because it is the one the next undo returns, so stepping
 * back costs one patch application (to make the next state whole) and one
 * deep copy, never a replay of the chain; the moment a newer state
 * arrives, the previous head is turned into the reverse patch from it, a
 * walk over the two documents that costs about as much as the copy the
 * old snapshots took. Memory is one snapshot per side plus patches the
 * size of each edit: moving one clip of five hundred is a few dozen bytes.
 *
 * `push`, `undo` and `redo` take ownership of the state handed in (pass a
 * fresh snapshot and do not change it after); what `undo` and `redo`
 * return is a deep copy the caller may change freely, since the stack's
 * documents share unchanged subtrees with each other. No runes here: the
 * engine mirrors `canUndo` and `canRedo` into its own state.
 */
export class UndoStack<T extends Json> {
	#depth: number;
	#past = new Side<T>();
	#future = new Side<T>();

	constructor(depth: number) {
		if (!(depth >= 1)) throw new Error("UndoStack: depth must be at least 1");
		this.#depth = depth;
	}

	/** Keeps `current` (the state before an edit) as the next undo, trims the oldest beyond the depth and clears redo. */
	push(current: T) {
		this.#past.push(current);
		this.#past.trim(this.#depth);
		this.#future.clear();
	}

	/** The state to restore, with `current` kept for redo; undefined when there is nothing to undo. */
	undo(current: T): T | undefined {
		return step(this.#past, this.#future, current);
	}

	/** The state to restore, with `current` kept for undo; undefined when there is nothing to redo. */
	redo(current: T): T | undefined {
		return step(this.#future, this.#past, current);
	}

	clear() {
		this.#past.clear();
		this.#future.clear();
	}

	get canUndo() {
		return this.#past.size > 0;
	}
	get canRedo() {
		return this.#future.size > 0;
	}
	/** The steps there are to undo. */
	get length() {
		return this.#past.size;
	}
}

function step<T extends Json>(from: Side<T>, to: Side<T>, current: T): T | undefined {
	const state = from.pop();
	if (state === undefined) return undefined;
	to.push(current);
	return structuredClone(state);
}

/** One side of the stack: the newest state whole, the older ones as patches from their successors (oldest first). */
class Side<T extends Json> {
	#head: T | undefined;
	#older: Patch[] = [];

	get size() {
		return this.#head === undefined ? 0 : this.#older.length + 1;
	}

	push(state: T) {
		if (this.#head !== undefined) this.#older.push(patchBetween(state, this.#head));
		this.#head = state;
	}

	pop(): T | undefined {
		const head = this.#head;
		if (head === undefined) return undefined;
		const patch = this.#older.pop();
		this.#head = patch === undefined ? undefined : (applyPatch(head, patch) as T);
		return head;
	}

	trim(depth: number) {
		const extra = this.size - depth;
		if (extra > 0) this.#older.splice(0, extra);
	}

	clear() {
		this.#head = undefined;
		this.#older = [];
	}
}
