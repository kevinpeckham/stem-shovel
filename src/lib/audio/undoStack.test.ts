import { describe, expect, it } from "vite-plus/test";
import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import { UndoStack } from "./undoStack";

type Doc = {
	bpm: number;
	clips: { id: string; start: number; gainEnvelope?: { t: number; v: number }[] }[];
	markers?: { id: string; t: number }[];
};

/** The engine's behavior before the stack: whole clones on both sides. */
class Reference<T> {
	past: T[] = [];
	future: T[] = [];
	constructor(private depth: number) {}
	push(current: T) {
		this.past.push(structuredClone(current));
		if (this.past.length > this.depth) this.past.shift();
		this.future = [];
	}
	undo(current: T) {
		const prev = this.past.pop();
		if (prev === undefined) return undefined;
		this.future.push(structuredClone(current));
		return prev;
	}
	redo(current: T) {
		const next = this.future.pop();
		if (next === undefined) return undefined;
		this.past.push(structuredClone(current));
		return next;
	}
}

/** A seeded generator, so a failure replays. */
function random(seed: number) {
	return () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 2 ** 32;
	};
}

function edit(doc: Doc, rand: () => number, n: number) {
	const pick = Math.floor(rand() * 7);
	const clip = doc.clips[Math.floor(rand() * doc.clips.length)];
	if (pick === 0 || !clip)
		doc.clips.splice(Math.floor(rand() * (doc.clips.length + 1)), 0, { id: `c${n}`, start: n });
	else if (pick === 1) doc.clips.splice(doc.clips.indexOf(clip), 1);
	else if (pick === 2) clip.start += 1;
	else if (pick === 3) clip.gainEnvelope = [{ t: rand(), v: rand() }];
	else if (pick === 4) delete clip.gainEnvelope;
	else if (pick === 5) doc.bpm = 60 + Math.floor(rand() * 100);
	else if (doc.markers) delete doc.markers;
	else doc.markers = [{ id: `m${n}`, t: n }];
}

function compare(depth: number, seed: number) {
	const rand = random(seed);
	const stack = new UndoStack<Doc>(depth);
	const reference = new Reference<Doc>(depth);
	let doc: Doc = {
		bpm: 120,
		clips: Array.from({ length: 20 }, (_, n) => ({ id: `s${n}`, start: n })),
	};
	let expected = structuredClone(doc);
	for (let n = 0; n < 200; n++) {
		const roll = rand();
		if (roll < 0.55) {
			stack.push(structuredClone(doc));
			reference.push(expected);
			edit(doc, rand, n);
			expected = structuredClone(doc);
		} else {
			const which = roll < 0.8 ? "undo" : "redo";
			const got = stack[which](structuredClone(doc));
			const want = reference[which](expected);
			expect(got).toEqual(want);
			if (got && want) {
				doc = got;
				expected = want;
			}
		}
		expect(doc).toEqual(expected);
		expect(stack.canUndo).toBe(reference.past.length > 0);
		expect(stack.canRedo).toBe(reference.future.length > 0);
		expect(stack.length).toBe(reference.past.length);
	}
}

describe("UndoStack", () => {
	it("matches whole-snapshot undo across random edit, undo and redo sequences", () => {
		for (const seed of [1, 2, 3, 4, 5]) compare(100, seed);
	});

	it("matches it with a shallow depth that trims", () => {
		for (const seed of [6, 7, 8]) compare(5, seed);
		for (const seed of [9, 10]) compare(1, seed);
	});

	it("trims the oldest beyond its depth", () => {
		const stack = new UndoStack<{ n: number }>(3);
		for (let n = 0; n < 6; n++) stack.push({ n });
		expect(stack.length).toBe(3);
		expect(stack.undo({ n: 6 })).toEqual({ n: 5 });
		expect(stack.undo({ n: 5 })).toEqual({ n: 4 });
		expect(stack.undo({ n: 4 })).toEqual({ n: 3 });
		expect(stack.undo({ n: 3 })).toBeUndefined();
		expect(stack.canUndo).toBe(false);
	});

	it("clears redo on a new push, and everything on clear", () => {
		const stack = new UndoStack<{ n: number }>(10);
		stack.push({ n: 0 });
		stack.push({ n: 1 });
		expect(stack.undo({ n: 2 })).toEqual({ n: 1 });
		expect(stack.canRedo).toBe(true);
		stack.push({ n: 1 });
		expect(stack.canRedo).toBe(false);
		expect(stack.redo({ n: 9 })).toBeUndefined();
		expect(stack.undo({ n: 3 })).toEqual({ n: 1 });
		stack.clear();
		expect([stack.canUndo, stack.canRedo, stack.length]).toEqual([false, false, 0]);
	});

	it("hands back a copy the caller may change", () => {
		const stack = new UndoStack<{ list: { id: string; v: number }[] }>(10);
		stack.push({ list: [{ id: "a", v: 1 }] });
		stack.push({ list: [{ id: "a", v: 2 }] });
		const got = stack.undo({ list: [{ id: "a", v: 3 }] });
		got!.list[0].v = 99;
		expect(stack.undo({ list: [{ id: "a", v: 2 }] })).toEqual({ list: [{ id: "a", v: 1 }] });
		expect(stack.redo({ list: [{ id: "a", v: 1 }] })).toEqual({ list: [{ id: "a", v: 2 }] });
	});

	it("takes the Studio arrangement's type", () => {
		expect(new UndoStack<StudioArrangement>(100).canUndo).toBe(false);
	});
});
