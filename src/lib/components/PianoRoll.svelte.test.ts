import { fireEvent, render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The piano-roll editor over an engine double: the rows and the notes it
 * draws, the keyboard column's audition, the selection, and the edits the
 * keys and the velocity slider send to the engine. Pointer geometry is
 * zero in jsdom, so adding by click and dragging are the browser spec's
 * (tests/e2e/studio-roll.spec.ts).
 */
const h = vi.hoisted(() => {
	const clip = {
		id: "clip-1",
		trackId: "t-1",
		notes: [
			{ t: 0, d: 0.5, p: 60, v: 0.6 },
			{ t: 0.5, d: 0.5, p: 64, v: 0.8 },
			{ t: 1, d: 0.5, p: 67, v: 1 },
		],
		start: 2,
		offset: 0,
		duration: 2,
		gain: 1,
		fadeIn: 0,
		fadeOut: 0,
		name: "Riff",
	};
	const engine = {
		arrangement: {
			bpm: 120,
			beatsPerBar: 4,
			tracks: [
				{ id: "t-1", kind: "midi", name: "Keys", input: { source: "piano", channel: "stereo" } },
			],
			clips: [clip],
		},
		beatSeconds: 0.5,
		barSeconds: 2,
		running: false,
		position: 0,
		setClipNotes: vi.fn(),
		auditionNote: vi.fn(),
	};
	return { engine, clip };
});
vi.mock("#lib/audio/studio.svelte.js", () => ({ studio: h.engine }));

const { default: PianoRoll } = await import("./PianoRoll.svelte");

// jsdom has no pointer capture; the notes take it on a press.
beforeAll(() => {
	if (!("setPointerCapture" in Element.prototype))
		Object.assign(Element.prototype, {
			setPointerCapture() {},
			releasePointerCapture() {},
		});
});
beforeEach(() => {
	vi.clearAllMocks();
	h.engine.arrangement.clips[0].notes = [
		{ t: 0, d: 0.5, p: 60, v: 0.6 },
		{ t: 0.5, d: 0.5, p: 64, v: 0.8 },
		{ t: 1, d: 0.5, p: 67, v: 1 },
	];
	h.engine.arrangement.tracks[0].input = { source: "piano", channel: "stereo" };
	// The engine keeps the notes it is handed, sorted, as the real one does.
	h.engine.setClipNotes.mockImplementation((_id: string, notes: typeof h.clip.notes) => {
		h.engine.arrangement.clips[0].notes = [...notes].sort((a, b) => a.t - b.t || a.p - b.p);
	});
});

const note = (name: string) => screen.getByRole("button", { name });

describe("PianoRoll", () => {
	test("draws a row per pitch over whole octaves with the Cs named, and a note per note with its name, time and length", () => {
		render(PianoRoll, { props: { clipId: "clip-1" } });
		expect(screen.getByText("3 notes")).toBeInTheDocument();
		const keys = screen.getAllByRole("button", { name: /^Sound / });
		expect(keys[0]).toHaveAccessibleName("Sound B6");
		expect(keys[keys.length - 1]).toHaveAccessibleName("Sound C3");
		expect(keys.filter((k) => k.textContent?.trim()).map((k) => k.textContent?.trim())).toEqual([
			"C6",
			"C5",
			"C4",
			"C3",
		]);
		expect(note("C4 at 0:00.0, 0.50 s")).toBeInTheDocument();
		expect(note("E4 at 0:00.5, 0.50 s")).toBeInTheDocument();
		expect(note("G4 at 0:01.0, 0.50 s")).toHaveStyle({ opacity: "1" });
		expect(note("C4 at 0:00.0, 0.50 s")).toHaveStyle({ left: "0px", width: "60px" });
	});
	test("a drums track names its rows by voice and shows no black keys", () => {
		h.engine.arrangement.tracks[0].input = { source: "drums", channel: "stereo" };
		h.engine.arrangement.clips[0].notes = [{ t: 0, d: 0.1, p: 36, v: 1 }];
		render(PianoRoll, { props: { clipId: "clip-1" } });
		expect(screen.getByRole("button", { name: "Sound Kick" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Sound Closed hat" })).toBeInTheDocument();
		expect(note("Kick at 0:00.0, 0.10 s")).toBeInTheDocument();
	});
	test("the keyboard column sounds its pitch through the track's instrument", async () => {
		const user = userEvent.setup();
		render(PianoRoll, { props: { clipId: "clip-1" } });
		await user.click(screen.getByRole("button", { name: "Sound C4" }));
		expect(h.engine.auditionNote).toHaveBeenCalledWith("t-1", 60, 0.8);
	});
	// The engine double's arrangement is a plain object (no runes outside a .svelte.ts), so the component sees
	// each edit's result only on a fresh render: one edit per test.
	const select = async (...names: string[]) => {
		for (const [i, name] of names.entries())
			await fireEvent.pointerDown(note(name), { button: 0, pointerId: i + 1, shiftKey: i > 0 });
	};
	test("a press selects a note and sounds it; Shift adds another", async () => {
		render(PianoRoll, { props: { clipId: "clip-1" } });
		await select("C4 at 0:00.0, 0.50 s");
		expect(h.engine.auditionNote).toHaveBeenCalledWith("t-1", 60, 0.6);
		expect(note("C4 at 0:00.0, 0.50 s")).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByText("3 notes · 1 selected")).toBeInTheDocument();
		await fireEvent.pointerDown(note("E4 at 0:00.5, 0.50 s"), {
			button: 0,
			pointerId: 2,
			shiftKey: true,
		});
		expect(screen.getByText("3 notes · 2 selected")).toBeInTheDocument();
		// Shift on a selected note takes it out again.
		await fireEvent.pointerDown(note("E4 at 0:00.5, 0.50 s"), {
			button: 0,
			pointerId: 3,
			shiftKey: true,
		});
		expect(screen.getByText("3 notes · 1 selected")).toBeInTheDocument();
		expect(h.engine.setClipNotes).not.toHaveBeenCalled();
	});
	test("the arrow keys nudge the selection: a semitone up, an octave with Shift, a grid step sideways; Delete removes it", async () => {
		const grid = () => screen.getByRole("application", { name: "Notes" });
		let r = render(PianoRoll, { props: { clipId: "clip-1" } });
		await select("C4 at 0:00.0, 0.50 s", "E4 at 0:00.5, 0.50 s");
		await fireEvent.keyDown(grid(), { key: "ArrowUp" });
		expect(h.engine.setClipNotes).toHaveBeenLastCalledWith("clip-1", [
			{ t: 0, d: 0.5, p: 61, v: 0.6 },
			{ t: 0.5, d: 0.5, p: 65, v: 0.8 },
			{ t: 1, d: 0.5, p: 67, v: 1 },
		]);
		r.unmount();
		r = render(PianoRoll, { props: { clipId: "clip-1" } });
		await select("C♯4 at 0:00.0, 0.50 s");
		await fireEvent.keyDown(grid(), { key: "ArrowDown", shiftKey: true });
		expect(h.engine.setClipNotes.mock.lastCall?.[1].map((n: { p: number }) => n.p)).toEqual([
			49, 65, 67,
		]);
		r.unmount();
		r = render(PianoRoll, { props: { clipId: "clip-1" } });
		await select("G4 at 0:01.0, 0.50 s");
		await fireEvent.keyDown(grid(), { key: "ArrowRight" });
		expect(h.engine.setClipNotes.mock.lastCall?.[1][2]).toEqual({ t: 1.25, d: 0.5, p: 67, v: 1 });
		r.unmount();
		render(PianoRoll, { props: { clipId: "clip-1" } });
		await select("C♯3 at 0:00.0, 0.50 s", "F4 at 0:00.5, 0.50 s");
		await fireEvent.keyDown(grid(), { key: "Delete" });
		expect(h.engine.setClipNotes).toHaveBeenLastCalledWith("clip-1", [
			{ t: 1.25, d: 0.5, p: 67, v: 1 },
		]);
	});
	test("Escape clears the selection, and the keys do nothing without one", async () => {
		render(PianoRoll, { props: { clipId: "clip-1" } });
		const grid = screen.getByRole("application", { name: "Notes" });
		await fireEvent.pointerDown(note("C4 at 0:00.0, 0.50 s"), { button: 0, pointerId: 1 });
		await fireEvent.keyDown(grid, { key: "Escape" });
		expect(screen.getByText("3 notes")).toBeInTheDocument();
		await fireEvent.keyDown(grid, { key: "Delete" });
		await fireEvent.keyDown(grid, { key: "ArrowUp" });
		expect(h.engine.setClipNotes).not.toHaveBeenCalled();
	});
	test("the velocity slider shows the selection's average and sets it; the Remove button removes the selection", async () => {
		const user = userEvent.setup();
		render(PianoRoll, { props: { clipId: "clip-1" } });
		const slider = screen.getByLabelText("Velocity of the selected notes");
		expect(slider).toHaveValue("0.8");
		await fireEvent.pointerDown(note("C4 at 0:00.0, 0.50 s"), { button: 0, pointerId: 1 });
		await fireEvent.pointerDown(note("G4 at 0:01.0, 0.50 s"), {
			button: 0,
			pointerId: 2,
			shiftKey: true,
		});
		expect(slider).toHaveValue("0.8");
		await fireEvent.change(slider, { target: { value: "0.3" } });
		expect(h.engine.setClipNotes).toHaveBeenLastCalledWith("clip-1", [
			{ t: 0, d: 0.5, p: 60, v: 0.3 },
			{ t: 0.5, d: 0.5, p: 64, v: 0.8 },
			{ t: 1, d: 0.5, p: 67, v: 0.3 },
		]);
		await user.click(screen.getByRole("button", { name: "Remove" }));
		expect(h.engine.setClipNotes).toHaveBeenLastCalledWith("clip-1", [
			{ t: 0.5, d: 0.5, p: 64, v: 0.8 },
		]);
	});
	test("the grid step select changes what the arrow keys nudge by", async () => {
		const user = userEvent.setup();
		render(PianoRoll, { props: { clipId: "clip-1" } });
		await user.selectOptions(screen.getByLabelText("Grid step"), "4");
		const grid = screen.getByRole("application", { name: "Notes" });
		await fireEvent.pointerDown(note("G4 at 0:01.0, 0.50 s"), { button: 0, pointerId: 1 });
		await fireEvent.keyDown(grid, { key: "ArrowLeft" });
		expect(h.engine.setClipNotes.mock.lastCall?.[1][2]).toEqual({ t: 0.875, d: 0.5, p: 67, v: 1 });
	});
	test("says so when the clip is gone", () => {
		render(PianoRoll, { props: { clipId: "nope" } });
		expect(screen.getByText("The clip is gone.")).toBeInTheDocument();
		expect(within(screen.getByLabelText("Piano roll")).queryByRole("application")).toBeNull();
	});
});
