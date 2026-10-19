import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { StudioPersistence } from "./studioPersistence.svelte";

const arrangement = (master = 1): StudioArrangement => ({
	version: 1,
	bpm: 120,
	beatsPerBar: 4,
	gridOn: true,
	countIn: false,
	click: false,
	loop: null,
	master,
	tracks: [],
	clips: [],
});

function harness() {
	const state = { dirty: false, doc: arrangement(), number: 0 };
	const deps = {
		isDirty: () => state.dirty,
		setDirty: vi.fn((v: boolean) => (state.dirty = v)),
		snapshot: () => structuredClone(state.doc),
		ensureSong: vi.fn(async () => "song-1"),
		save: vi.fn(
			async (
				_id: string,
				_data: StudioArrangement,
				_base: number,
			): Promise<{ number: number; conflict?: boolean }> => ({ number: ++state.number }),
		),
		onConflict: vi.fn(async () => {}),
		notify: vi.fn(),
		delayMs: 100,
	};
	const edit = (master: number) => {
		state.doc = arrangement(master);
		state.dirty = true;
	};
	return { state, deps, edit, p: new StudioPersistence(deps) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("StudioPersistence", () => {
	it("saves once a moment after the last of a burst, with the base, and clears the flag", async () => {
		const { deps, edit, p, state } = harness();
		p.open(4);
		edit(0.5);
		p.schedule();
		edit(0.6);
		p.schedule();
		await vi.advanceTimersByTimeAsync(99);
		expect(deps.save).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(2);
		expect(deps.save).toHaveBeenCalledTimes(1);
		expect(deps.save).toHaveBeenCalledWith("song-1", expect.objectContaining({ master: 0.6 }), 4);
		expect(state.dirty).toBe(false);
		expect(p.baseNumber).toBe(1);
		// Unchanged since: a second save sends nothing and still clears the flag.
		state.dirty = true;
		await p.saveNow();
		expect(deps.save).toHaveBeenCalledTimes(1);
		expect(state.dirty).toBe(false);
	});
	it("runs saves one after another, each with the base the one before made", async () => {
		const { deps, edit, p } = harness();
		let release: () => void = () => {};
		deps.save.mockImplementationOnce(() => new Promise((r) => (release = () => r({ number: 7 }))));
		edit(0.1);
		const first = p.saveNow();
		// The first save reaches the remote call after the song's id resolves; an edit then, and a second save waits behind it.
		await vi.advanceTimersByTimeAsync(0);
		expect(deps.save).toHaveBeenCalledTimes(1);
		edit(0.2);
		const second = p.saveNow();
		release();
		await first;
		await second;
		expect(deps.save).toHaveBeenCalledTimes(2);
		expect(deps.save.mock.calls[1]![2]).toBe(7);
		expect(deps.save.mock.calls[1]![1]).toMatchObject({ master: 0.2 });
	});
	it("saves again when the song changed while a save was out", async () => {
		const { deps, edit, p, state } = harness();
		let release: () => void = () => {};
		deps.save.mockImplementationOnce(() => new Promise((r) => (release = () => r({ number: 1 }))));
		edit(0.1);
		const first = p.saveNow();
		await vi.advanceTimersByTimeAsync(0);
		edit(0.3); // during the save: the flag stays as it was
		release();
		await first;
		expect(state.dirty).toBe(true);
		await vi.advanceTimersByTimeAsync(101);
		expect(deps.save).toHaveBeenCalledTimes(2);
		expect(deps.save.mock.calls[1]![1]).toMatchObject({ master: 0.3 });
		expect(state.dirty).toBe(false);
	});
	it("hands a conflict to the page and writes nothing of its own; an error is a notice", async () => {
		const { deps, edit, p, state } = harness();
		deps.save.mockResolvedValueOnce({ number: 9, conflict: true });
		edit(0.4);
		await p.saveNow();
		expect(deps.onConflict).toHaveBeenCalledWith("song-1");
		expect(p.baseNumber).toBe(0);
		deps.save.mockRejectedValueOnce(new Error("offline"));
		state.dirty = true;
		await p.saveNow();
		expect(deps.notify).toHaveBeenCalledWith("Not saved: offline", { kind: "error" });
		expect(p.saving).toBe(false);
	});
	it("markSaved takes the server's state as saved; open resets", () => {
		const { p, state, edit } = harness();
		edit(0.9);
		p.markSaved(12);
		expect(p.baseNumber).toBe(12);
		expect(state.dirty).toBe(false);
		p.open(3);
		expect(p.baseNumber).toBe(3);
	});
});
