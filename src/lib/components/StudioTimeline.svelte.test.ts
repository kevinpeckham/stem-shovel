import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { defaultTrackFx } from "#lib/audio/trackChain.js";
import { rulerTicks } from "#lib/utils/rulerTicks.js";
import type { StudioArrangement, StudioClip, StudioTrack } from "#lib/val/StudioSchema.js";
import { fireEvent, render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The engine singleton carries Web Audio, so the component gets a plain
 * stand-in: the fields it reads and a spy for everything it calls. Nothing
 * here is runes state (a `.svelte.test.ts` is not compiled by the Svelte
 * plugin), so a test that wants another state renders again from a fresh
 * fixture rather than mutating the one on screen. `snap` rounds to the
 * half second, so a snapped call is telling apart from a raw one.
 */
const fake = vi.hoisted(() => {
	const engine = {
		arrangement: null as unknown as StudioArrangement,
		sources: {} as Record<string, FakeSource>,
		phase: "idle" as "idle" | "playing" | "recording" | "counting",
		position: 0,
		levels: {} as Record<string, number>,
		decoding: 0,
		recordFrom: 0,
		liveTick: 0,
		sampleRate: 48_000,
		running: false,
		get duration() {
			return Math.max(2, ...engine.arrangement.clips.map((c) => c.start + c.duration));
		},
		get anySolo() {
			return engine.arrangement.tracks.some((t) => t.solo);
		},
		get recording() {
			return engine.phase === "recording";
		},
		bufferOf: vi.fn(() => null),
		livePeaksOf: vi.fn(() => [0.2, 0.8]),
		seek: vi.fn(),
		snap: vi.fn((t: number) => Math.round(t * 2) / 2),
		setLoop: vi.fn(),
		trimClip: vi.fn(),
		moveClip: vi.fn(),
		deleteClip: vi.fn(),
		renameTrack: vi.fn(),
		moveTrack: vi.fn(),
		removeTrack: vi.fn(),
		setGain: vi.fn(),
		setPan: vi.fn(),
		setTrackFx: vi.fn(),
		toggleMute: vi.fn(),
		toggleSolo: vi.fn(),
		// Flips the flag as the engine would, so the header's "now armed" path runs.
		toggleArm: vi.fn((id: string) => {
			const t = engine.arrangement.tracks.find((x) => x.id === id);
			if (t) t.armed = !t.armed;
		}),
		setInput: vi.fn(),
	};
	interface FakeSource {
		id: string;
		label: string;
		durationSeconds: number;
		sampleRate: number;
		channels: number;
		peaks: Float32Array;
		status: "decoding" | "ready" | "failed";
		pending: boolean;
	}
	return engine;
});
vi.mock("#lib/audio/studio.svelte.js", () => ({
	studio: fake,
	LIVE_PEAK_FRAMES: 512,
	STUDIO_INPUT_LABELS: {
		mic: "Microphone",
		line: "Line in",
		computer: "Computer",
		piano: "Piano",
		chords: "Chord player",
		drums: "Drum machine",
	},
	STUDIO_INSTRUMENTS: ["piano", "chords", "drums"],
	isInstrument: (s: string) => ["piano", "chords", "drums"].includes(s),
}));
const { default: StudioTimeline } = await import("./StudioTimeline.svelte");

/** 40 px a second: the header is 184 px wide and the scroller's rect sits at x = 0 in jsdom, so a second is at 184 + 40 t. */
const PX = 40;
const HEADER_W = 184;
const LANE_H = 108;
const xAt = (seconds: number) => HEADER_W + seconds * PX;

function track(over: Partial<StudioTrack> & { id: string; name: string }): StudioTrack {
	return { gain: 1, pan: 0, muted: false, solo: false, armed: false, input: null, ...over };
}
function clip(
	over: Partial<StudioClip> & { id: string; trackId: string; sourceId: string },
): StudioClip {
	return { start: 0, offset: 0, duration: 1, gain: 1, fadeIn: 0, fadeOut: 0, name: "", ...over };
}
function source(id: string, over: Partial<(typeof fake.sources)[string]> = {}) {
	return {
		id,
		label: id,
		durationSeconds: 10,
		sampleRate: 48_000,
		channels: 1,
		peaks: new Float32Array([0.5, 0.5]),
		status: "ready" as const,
		pending: false,
		...over,
	};
}
/** Three tracks: an armed microphone track with a clip, a guitar track with effects and a three-take clip, a muted vocal whose source failed. */
function fixture(): StudioArrangement {
	return {
		version: 1,
		bpm: 120,
		beatsPerBar: 4,
		gridOn: true,
		countIn: true,
		click: true,
		loop: null,
		master: 1,
		tracks: [
			track({
				id: "t1",
				name: "Track 1",
				armed: true,
				input: { source: "mic", channel: "stereo" },
			}),
			track({
				id: "t2",
				name: "Guitar",
				gain: 0.8,
				pan: -0.5,
				fx: {
					compressor: { amount: 0, ratio: 4, attack: 0.01, release: 0.25, makeup: 0 },
					tone: { tilt: 0.5, air: 0, bottom: 0 },
					reverb: { level: 0.6, size: 0.5 },
				},
			}),
			track({ id: "t3", name: "Vox", muted: true }),
		],
		clips: [
			clip({
				id: "c1",
				trackId: "t1",
				sourceId: "s1",
				name: "Take 1",
				start: 2,
				duration: 4,
				fadeIn: 0.5,
			}),
			clip({
				id: "c2",
				trackId: "t2",
				sourceId: "s2",
				name: "Riff",
				start: 0,
				duration: 3,
				alternates: ["s3", "s4"],
				fadeOut: 1,
			}),
			clip({ id: "c3", trackId: "t3", sourceId: "s5", name: "Verse", start: 8, duration: 2 }),
		],
	};
}

beforeAll(() => {
	installFakePopover();
	// jsdom cannot scroll an option into view.
	if (!("scrollIntoView" in Element.prototype))
		Object.assign(Element.prototype, { scrollIntoView() {} });
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
	// jsdom has PointerEvent but no pointer capture.
	Object.assign(Element.prototype, { setPointerCapture() {}, releasePointerCapture() {} });
});
beforeEach(() => {
	vi.clearAllMocks();
	fake.arrangement = fixture();
	fake.sources = {
		s1: source("s1"),
		s2: source("s2", { pending: true }),
		s5: source("s5", { status: "failed" }),
	};
	fake.phase = "idle";
	fake.position = 0;
	fake.levels = {};
	fake.recordFrom = 0;
});

const timeline = () => screen.getByRole("application", { name: "Timeline" });
const clipEl = (id: string) => document.querySelector(`[data-clip="${id}"]`) as HTMLElement;
const ruler = () => document.querySelector(".cursor-text") as HTMLElement;
const playhead = () => document.querySelector(".z-15") as HTMLElement;
/** A pointer event with a button, an id and a place; the rest of the geometry is jsdom's zeros. */
const at = (clientX: number, clientY = 0, more: PointerEventInit = {}) => ({
	button: 0,
	pointerId: 7,
	clientX,
	clientY,
	...more,
});

describe("StudioTimeline", () => {
	test("renders the grid corner, a header per track and a clip per clip with its badges", () => {
		render(StudioTimeline);
		expect(screen.getByText("120 bpm · 4/4")).toBeInTheDocument();
		expect(
			screen
				.getAllByRole("textbox", { name: "Track name" })
				.map((el) => (el as HTMLInputElement).value),
		).toEqual(["Track 1", "Guitar", "Vox"]);
		expect(screen.getByRole("button", { name: "Take 1 at 0:02.0" })).toHaveAttribute(
			"data-clip",
			"c1",
		);
		expect(clipEl("c1")).toHaveAttribute("title", "Take 1 · 0:02.0 – 0:06.0");
		expect(clipEl("c1").style.left).toBe("80px");
		expect(clipEl("c1").style.width).toBe("160px");
		expect(clipEl("c1").textContent?.trim()).toBe("Take 1");
		expect(clipEl("c2")).toHaveTextContent("Riff · 3 takes · saving…");
		expect(clipEl("c3")).toHaveTextContent("Verse · not loaded");
		// A failed or pending source draws its canvas faint; a ready one, bright.
		expect(clipEl("c1").querySelector("canvas")).toHaveClass("opacity-90");
		expect(clipEl("c3").querySelector("canvas")).toHaveClass("opacity-30");
		// The fades are wedges sized by their seconds.
		expect(
			(clipEl("c1").querySelector(".left-0.pointer-events-none") as HTMLElement).style.width,
		).toBe("20px");
		expect(
			(clipEl("c2").querySelector(".right-0.pointer-events-none") as HTMLElement).style.width,
		).toBe("40px");
		expect(screen.queryByText(/No tracks yet/)).toBeNull();
	});

	test("with no tracks the lanes give way to a hint", () => {
		fake.arrangement.tracks = [];
		fake.arrangement.clips = [];
		render(StudioTimeline);
		expect(screen.getByText("No tracks yet. Add one and arm it to record.")).toBeInTheDocument();
		expect(screen.queryByRole("textbox", { name: "Track name" })).toBeNull();
	});

	test("the ruler's ticks and labels come from rulerTicks, on the grid and in free time", () => {
		const { unmount } = render(StudioTimeline);
		// The lanes run 60 s at least (the song is 10 s long and the view has no width in jsdom).
		const expected = rulerTicks({
			seconds: 60,
			pxPerSecond: PX,
			grid: { on: true, bpm: 120, beatsPerBar: 4 },
		});
		const labels = [...ruler().querySelectorAll("span")].map((s) => s.textContent);
		expect(labels).toEqual(expected.filter((t) => t.label).map((t) => t.label));
		expect(labels.slice(0, 3)).toEqual(["1", "2", "3"]);
		expect(ruler().querySelectorAll(".w-px")).toHaveLength(expected.length);
		expect(ruler().querySelectorAll(".h-3")).toHaveLength(expected.filter((t) => t.major).length);
		// The lanes carry a bar line per major tick while the grid is on.
		expect(clipEl("c1").parentElement!.querySelectorAll(".bg-white\\/6")).toHaveLength(30);
		unmount();
		fake.arrangement.gridOn = false;
		render(StudioTimeline);
		expect(screen.getByText("Free time")).toBeInTheDocument();
		expect([...ruler().querySelectorAll("span")].map((s) => s.textContent).slice(0, 3)).toEqual([
			"0:00",
			"0:02",
			"0:04",
		]);
		expect(clipEl("c1").parentElement!.querySelectorAll(".bg-white\\/6")).toHaveLength(0);
	});

	test("the arm button shows the state, toggles it on the engine and reports a newly armed track", async () => {
		const user = userEvent.setup();
		const onarm = vi.fn();
		render(StudioTimeline, { props: { onarm } });
		const arm1 = screen.getByRole("button", { name: "Arm Track 1 for recording" });
		const arm2 = screen.getByRole("button", { name: "Arm Guitar for recording" });
		expect(arm1).toHaveAttribute("aria-pressed", "true");
		expect(arm2).toHaveAttribute("aria-pressed", "false");
		await user.click(arm2);
		expect(fake.toggleArm).toHaveBeenCalledWith("t2");
		expect(onarm).toHaveBeenCalledWith(expect.objectContaining({ id: "t2", armed: true }));
		// Disarming reports nothing.
		await user.click(arm1);
		expect(fake.toggleArm).toHaveBeenLastCalledWith("t1");
		expect(onarm).toHaveBeenCalledTimes(1);
	});

	test("mute and solo buttons carry pressed states and call the engine; a muted or un-soloed track is dimmed", async () => {
		const user = userEvent.setup();
		const { unmount } = render(StudioTimeline);
		expect(screen.getByRole("button", { name: "Mute Vox" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(screen.getByRole("button", { name: "Mute Track 1" })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
		expect(screen.getByRole("button", { name: "Solo Track 1" })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
		await user.click(screen.getByRole("button", { name: "Mute Track 1" }));
		expect(fake.toggleMute).toHaveBeenCalledWith("t1");
		await user.click(screen.getByRole("button", { name: "Solo Guitar" }));
		expect(fake.toggleSolo).toHaveBeenCalledWith("t2");
		const names = () => screen.getAllByRole("textbox", { name: "Track name" });
		expect(names()[2]).toHaveClass("opacity-60");
		expect(names()[0]).not.toHaveClass("opacity-60");
		expect(clipEl("c3")).toHaveClass("opacity-50");
		unmount();
		// A solo anywhere silences every other track.
		fake.arrangement.tracks[1].solo = true;
		render(StudioTimeline);
		expect(screen.getByRole("button", { name: "Solo Guitar" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(names()[0]).toHaveClass("opacity-60");
		expect(names()[1]).not.toHaveClass("opacity-60");
	});

	test("the input picker lists the outside sources by channel and the instruments, shows the track's input and sets it", async () => {
		const user = userEvent.setup();
		const onarm = vi.fn();
		render(StudioTimeline, { props: { onarm } });
		const picker = screen.getByRole("combobox", { name: "Track 1 input" });
		expect(picker).toHaveTextContent("Microphone · stereo");
		expect(screen.getByRole("combobox", { name: "Guitar input" })).toHaveTextContent("No input");
		await user.click(picker);
		const list = screen.getByRole("listbox", { name: "Track 1 input" });
		expect(
			within(list)
				.getAllByRole("option")
				.map((o) => o.textContent?.trim()),
		).toEqual([
			"No input",
			"Microphone · stereo",
			"Microphone · left",
			"Microphone · right",
			"Line in · stereo",
			"Line in · left",
			"Line in · right",
			"Computer · stereo",
			"Computer · left",
			"Computer · right",
			"Piano",
			"Chord player",
			"Drum machine",
		]);
		expect(within(list).getByRole("option", { name: "Microphone · stereo" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		// An armed track picking an input asks the page to open it.
		await user.click(within(list).getByRole("option", { name: "Piano" }));
		expect(fake.setInput).toHaveBeenCalledWith("t1", { source: "piano", channel: "stereo" });
		expect(onarm).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
		await user.click(picker);
		await user.click(
			within(screen.getByRole("listbox", { name: "Track 1 input" })).getByRole("option", {
				name: "No input",
			}),
		);
		expect(fake.setInput).toHaveBeenLastCalledWith("t1", null);
		// An unarmed track does not.
		await user.click(screen.getByRole("combobox", { name: "Guitar input" }));
		await user.click(
			within(screen.getByRole("listbox", { name: "Guitar input" })).getByRole("option", {
				name: "Line in · left",
			}),
		);
		expect(fake.setInput).toHaveBeenLastCalledWith("t2", { source: "line", channel: "left" });
		expect(onarm).toHaveBeenCalledTimes(1);
	});

	test("renaming a track on change; Enter leaves the field", async () => {
		render(StudioTimeline);
		const name = screen.getAllByRole("textbox", { name: "Track name" })[1];
		await fireEvent.change(name, { target: { value: "Lead" } });
		expect(fake.renameTrack).toHaveBeenCalledWith("t2", "Lead");
		name.focus();
		expect(document.activeElement).toBe(name);
		await fireEvent.keyDown(name, { key: "Enter" });
		expect(document.activeElement).not.toBe(name);
	});

	test("the fader and the pan reach the engine as they move; a double-click centres the pan", async () => {
		render(StudioTimeline);
		// The fader and the pan are a Slider and a Knob: sliders to assistive technology, moved by the keys here.
		const level = screen.getByRole("slider", { name: "Guitar level" });
		const pan = screen.getByRole("slider", { name: "Guitar pan" });
		expect(level).toHaveAttribute("aria-valuenow", "0.8");
		expect(level).toHaveAttribute("aria-valuetext", "-2 dB");
		expect(pan).toHaveAttribute("aria-valuenow", "-0.5");
		expect(pan).toHaveAttribute("aria-valuetext", "L 50");
		await fireEvent.keyDown(level, { key: "ArrowDown" });
		expect(fake.setGain).toHaveBeenCalledWith("t2", 0.79);
		await fireEvent.keyDown(pan, { key: "ArrowRight" });
		expect(fake.setPan).toHaveBeenCalledWith("t2", -0.45);
		await fireEvent.dblClick(pan);
		expect(fake.setPan).toHaveBeenLastCalledWith("t2", 0);
	});

	test("the meter follows the track's level and turns red near the top", () => {
		fake.levels = { t1: 0.5, t2: 0.9 };
		render(StudioTimeline);
		const bars = [...document.querySelectorAll(".h-1.w-full > div")] as HTMLElement[];
		expect(bars.map((b) => b.style.width)).toEqual(["50%", "90%", "0%"]);
		expect(bars[0]).toHaveClass("bg-blue-300");
		expect(bars[1]).toHaveClass("bg-red-500");
	});

	test("the effects menu opens the track's compressor, tone and reverb, and a slider sends the whole fx to the engine", async () => {
		const user = userEvent.setup();
		render(StudioTimeline);
		const button = screen.getByRole("button", { name: "Track 1 effects" });
		expect(button).toHaveAttribute("title", "Compressor, tone and reverb for this track");
		expect(button).not.toHaveClass("text-accent");
		// A track with effects on shows it on its button.
		expect(screen.getByRole("button", { name: "Guitar effects" })).toHaveClass("text-accent");
		await user.click(button);
		const level = screen.getByRole("slider", { name: "Track 1 reverb level" });
		expect(level).toBeVisible();
		// Every track's menu is in the DOM (closed ones display:none): the readouts are read within the open one.
		const menu = within(level.closest("[popover]") as HTMLElement);
		expect(menu.getByText("Track 1 effects")).toHaveClass("uppercase");
		expect(menu.getByText("Level · 0%")).toBeInTheDocument();
		expect(menu.getByText("Tilt · flat")).toBeInTheDocument();
		expect(menu.getByText("Size · a hall")).toBeInTheDocument();
		await fireEvent.input(screen.getByRole("slider", { name: "Track 1 reverb level" }), {
			target: { value: "0.6" },
		});
		expect(fake.setTrackFx).toHaveBeenLastCalledWith("t1", {
			...defaultTrackFx(),
			reverb: { level: 0.6, size: 0.5 },
		});
		await fireEvent.input(screen.getByRole("slider", { name: "Track 1 tone tilt" }), {
			target: { value: "0.5" },
		});
		expect(fake.setTrackFx).toHaveBeenLastCalledWith("t1", {
			...defaultTrackFx(),
			tone: { tilt: 0.5, air: 0, bottom: 0 },
		});
		await fireEvent.input(screen.getByRole("slider", { name: "Track 1 compressor make-up gain" }), {
			target: { value: "6" },
		});
		expect(fake.setTrackFx).toHaveBeenLastCalledWith("t1", {
			...defaultTrackFx(),
			compressor: { amount: 0, ratio: 4, attack: 0.01, release: 0.25, makeup: 6 },
		});
		// The reverb's size rebuilds the impulse, so it waits for the change.
		const size = screen.getByRole("slider", { name: "Track 1 reverb size" });
		await fireEvent.input(size, { target: { value: "0.9" } });
		expect(fake.setTrackFx).toHaveBeenCalledTimes(3);
		await fireEvent.change(size, { target: { value: "0.9" } });
		expect(fake.setTrackFx).toHaveBeenLastCalledWith("t1", {
			...defaultTrackFx(),
			reverb: { level: 0, size: 0.9 },
		});
		await fireEvent.dblClick(screen.getByRole("slider", { name: "Track 1 tone tilt" }));
		expect(fake.setTrackFx).toHaveBeenLastCalledWith("t1", defaultTrackFx());
	});

	test("a track's effects show their values; a slider patches one field and Reset clears them all", async () => {
		const user = userEvent.setup();
		render(StudioTimeline);
		await user.click(screen.getByRole("button", { name: "Guitar effects" }));
		const level = screen.getByRole("slider", { name: "Guitar reverb level" });
		expect(level).toHaveValue("0.6");
		const menu = within(level.closest("[popover]") as HTMLElement);
		expect(menu.getByText("Level · 60%")).toBeInTheDocument();
		expect(menu.getByText("Tilt · bright")).toBeInTheDocument();
		await fireEvent.input(screen.getByRole("slider", { name: "Guitar tone air" }), {
			target: { value: "0.3" },
		});
		expect(fake.setTrackFx).toHaveBeenLastCalledWith("t2", {
			compressor: { amount: 0, ratio: 4, attack: 0.01, release: 0.25, makeup: 0 },
			tone: { tilt: 0.5, air: 0.3, bottom: 0 },
			reverb: { level: 0.6, size: 0.5 },
		});
		await user.click(screen.getByRole("button", { name: "Reset effects" }));
		expect(fake.setTrackFx).toHaveBeenLastCalledWith("t2", defaultTrackFx());
	});

	test("the actions menu moves a track, and removes one after confirming when it has clips", async () => {
		const user = userEvent.setup();
		const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
		render(StudioTimeline);
		await user.click(screen.getByRole("button", { name: "Track 1 actions" }));
		expect(screen.getByRole("button", { name: "Move up" })).toBeDisabled();
		await user.click(screen.getByRole("button", { name: "Move down" }));
		expect(fake.moveTrack).toHaveBeenCalledWith("t1", 1);
		await user.click(screen.getByRole("button", { name: "Track 1 actions" }));
		await user.click(screen.getByRole("button", { name: "Remove track" }));
		expect(confirm).toHaveBeenCalledWith("Remove “Track 1” and its 1 clip?");
		expect(fake.removeTrack).not.toHaveBeenCalled();
		confirm.mockReturnValue(true);
		await user.click(screen.getByRole("button", { name: "Track 1 actions" }));
		await user.click(screen.getByRole("button", { name: "Remove track" }));
		expect(fake.removeTrack).toHaveBeenCalledWith("t1");
		// The last track cannot move down.
		await user.click(screen.getByRole("button", { name: "Vox actions" }));
		expect(screen.getByRole("button", { name: "Move down" })).toBeDisabled();
		await user.click(screen.getByRole("button", { name: "Move up" }));
		expect(fake.moveTrack).toHaveBeenLastCalledWith("t3", 1);
		confirm.mockRestore();
	});

	test("a track without clips is removed without asking", async () => {
		const user = userEvent.setup();
		const confirm = vi.spyOn(window, "confirm");
		fake.arrangement.clips = [];
		render(StudioTimeline);
		await user.click(screen.getByRole("button", { name: "Guitar actions" }));
		await user.click(screen.getByRole("button", { name: "Remove track" }));
		expect(confirm).not.toHaveBeenCalled();
		expect(fake.removeTrack).toHaveBeenCalledWith("t2");
		confirm.mockRestore();
	});

	test("Delete or Backspace removes the selected clip, Escape deselects it, and a text field keeps its keys", async () => {
		const { rerender } = render(StudioTimeline, { props: { selected: "c1" } });
		expect(clipEl("c1")).toHaveClass("border-accent");
		expect(clipEl("c2")).not.toHaveClass("border-accent");
		const del = new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true });
		await fireEvent(timeline(), del);
		expect(fake.deleteClip).toHaveBeenCalledWith("c1");
		expect(del.defaultPrevented).toBe(true);
		expect(clipEl("c1")).not.toHaveClass("border-accent");
		// Nothing selected: the key does nothing.
		await fireEvent.keyDown(timeline(), { key: "Delete" });
		expect(fake.deleteClip).toHaveBeenCalledTimes(1);
		await rerender({ selected: "c2" });
		await fireEvent.keyDown(timeline(), { key: "Backspace" });
		expect(fake.deleteClip).toHaveBeenLastCalledWith("c2");
		await rerender({ selected: "c3" });
		expect(clipEl("c3")).toHaveClass("border-accent");
		await fireEvent.keyDown(timeline(), { key: "Escape" });
		expect(clipEl("c3")).not.toHaveClass("border-accent");
		expect(fake.deleteClip).toHaveBeenCalledTimes(2);
		// Typing in the track name bubbles to the timeline but is left alone.
		await rerender({ selected: "c3" });
		await fireEvent.keyDown(screen.getAllByRole("textbox", { name: "Track name" })[0], {
			key: "Backspace",
		});
		expect(fake.deleteClip).toHaveBeenCalledTimes(2);
		expect(clipEl("c3")).toHaveClass("border-accent");
	});

	test("a press selects a clip; dragging it moves it along the lane, snapped, and onto another track", async () => {
		render(StudioTimeline);
		const c1 = clipEl("c1");
		await fireEvent.pointerDown(c1, at(100));
		expect(c1).toHaveClass("border-accent");
		expect(document.activeElement).toBe(c1);
		// A jitter under three pixels is not a drag.
		await fireEvent.pointerMove(c1, at(102));
		await fireEvent.pointerUp(c1, at(102));
		expect(fake.moveClip).not.toHaveBeenCalled();
		expect(c1).toHaveClass("border-accent");
		// 80 px right is two seconds; the preview translates the clip, the release moves it.
		await fireEvent.pointerDown(c1, at(100));
		await fireEvent.pointerMove(c1, at(180));
		expect(c1).toHaveClass("cursor-grabbing");
		expect(c1.style.transform).toBe("translate(80px, 0px)");
		await fireEvent.pointerUp(c1, at(180));
		expect(fake.moveClip).toHaveBeenCalledWith("c1", 4, "t1");
		expect(c1.style.transform).toBe("");
		// 90 px is 2.25 s, snapped to 2.5; a lane's height down lands on the next track.
		await fireEvent.pointerDown(c1, at(100, 10));
		await fireEvent.pointerMove(c1, at(190, 10 + LANE_H));
		expect(c1.style.transform).toBe(`translate(100px, ${LANE_H}px)`);
		await fireEvent.pointerUp(c1, at(190, 10 + LANE_H));
		expect(fake.moveClip).toHaveBeenLastCalledWith("c1", 4.5, "t2");
		// Shift frees the move from the grid; a move cannot leave the tracks.
		await fireEvent.pointerDown(c1, at(100, 10));
		await fireEvent.pointerMove(c1, at(190, 10 - 5 * LANE_H, { shiftKey: true }));
		await fireEvent.pointerUp(c1, at(190, 10 - 5 * LANE_H, { shiftKey: true }));
		expect(fake.moveClip).toHaveBeenLastCalledWith("c1", 4.25, "t1");
		// Another pointer's events are not this drag's.
		await fireEvent.pointerDown(c1, at(100));
		await fireEvent.pointerMove(c1, { ...at(300), pointerId: 9 });
		await fireEvent.pointerUp(c1, { ...at(300), pointerId: 9 });
		expect(fake.moveClip).toHaveBeenCalledTimes(3);
		await fireEvent.pointerUp(c1, at(100));
		expect(fake.moveClip).toHaveBeenCalledTimes(3);
	});

	test("a press within a few pixels of a clip's edge trims it", async () => {
		render(StudioTimeline);
		const c1 = clipEl("c1");
		// jsdom's rects are empty; the clip is told it spans 100..260 px.
		c1.getBoundingClientRect = () =>
			({ left: 100, right: 260, width: 160, top: 0, bottom: 100, height: 100 }) as DOMRect;
		await fireEvent.pointerDown(c1, at(104));
		await fireEvent.pointerMove(c1, at(144));
		// The preview shows the trimmed clip: it starts a second later and is a second shorter.
		expect(c1.style.left).toBe("120px");
		expect(c1.style.width).toBe("120px");
		await fireEvent.pointerUp(c1, at(144));
		expect(fake.trimClip).toHaveBeenCalledWith("c1", { start: 3 });
		expect(fake.moveClip).not.toHaveBeenCalled();
		await fireEvent.pointerDown(c1, at(256));
		await fireEvent.pointerMove(c1, at(216));
		expect(c1.style.width).toBe("120px");
		await fireEvent.pointerUp(c1, at(216));
		expect(fake.trimClip).toHaveBeenLastCalledWith("c1", { end: 5 });
	});

	test("a press on the ruler seeks there, snapped unless Shift is held, and clears the selection", async () => {
		render(StudioTimeline, { props: { selected: "c1" } });
		await fireEvent.pointerDown(ruler(), at(xAt(3.25)));
		expect(fake.snap).toHaveBeenCalledWith(3.25);
		expect(fake.seek).toHaveBeenCalledWith(3.5);
		expect(clipEl("c1")).not.toHaveClass("border-accent");
		// Scrubbing follows the pointer until it lifts.
		await fireEvent.pointerMove(ruler(), at(xAt(4), 0, { shiftKey: true }));
		expect(fake.seek).toHaveBeenLastCalledWith(4);
		await fireEvent.pointerUp(ruler(), at(xAt(4)));
		await fireEvent.pointerMove(ruler(), at(xAt(5)));
		expect(fake.seek).toHaveBeenCalledTimes(2);
		// A press left of the lanes is the start; a secondary button does nothing.
		await fireEvent.pointerDown(ruler(), at(10));
		expect(fake.seek).toHaveBeenLastCalledWith(0);
		await fireEvent.pointerDown(ruler(), { ...at(xAt(6)), button: 2 });
		expect(fake.seek).toHaveBeenCalledTimes(3);
	});

	test("the loop region sits on the ruler and dragging an end sets the loop", async () => {
		fake.arrangement.loop = { on: true, start: 4, end: 8 };
		render(StudioTimeline);
		const region = screen.getByTitle("Loop region: drag its ends");
		expect(region.style.left).toBe("160px");
		expect(region.style.width).toBe("160px");
		expect(region).toHaveClass("border-accent");
		await fireEvent.pointerDown(ruler(), at(xAt(4)));
		expect(fake.seek).not.toHaveBeenCalled();
		await fireEvent.pointerMove(ruler(), at(xAt(5.2)));
		// The preview follows the drag, snapped.
		expect(region.style.left).toBe("200px");
		expect(region.style.width).toBe("120px");
		await fireEvent.pointerUp(ruler(), at(xAt(5.2)));
		expect(fake.setLoop).toHaveBeenCalledWith({ on: true, start: 5, end: 8 });
		// The end cannot cross the start.
		await fireEvent.pointerDown(ruler(), at(xAt(8)));
		await fireEvent.pointerMove(ruler(), at(xAt(1)));
		await fireEvent.pointerUp(ruler(), at(xAt(1)));
		expect(fake.setLoop).toHaveBeenLastCalledWith({ on: true, start: 4, end: 4.1 });
		expect(fake.seek).not.toHaveBeenCalled();
	});

	test("an off loop is drawn faint", () => {
		fake.arrangement.loop = { on: false, start: 1, end: 2 };
		render(StudioTimeline);
		expect(screen.getByTitle("Loop region: drag its ends")).toHaveClass("border-white/30");
	});

	test("a press on an empty lane seeks and deselects; a press on a clip does not seek", async () => {
		render(StudioTimeline, { props: { selected: "c2" } });
		const lane = clipEl("c1").parentElement!;
		await fireEvent.pointerDown(lane, at(xAt(1.25), 0, { shiftKey: true }));
		expect(fake.seek).toHaveBeenCalledWith(1.25);
		expect(fake.snap).not.toHaveBeenCalled();
		expect(clipEl("c2")).not.toHaveClass("border-accent");
		await fireEvent.pointerDown(lane, at(xAt(1.25)));
		expect(fake.seek).toHaveBeenLastCalledWith(1.5);
		await fireEvent.pointerDown(clipEl("c1"), at(xAt(3)));
		expect(fake.seek).toHaveBeenCalledTimes(2);
	});

	test("⌘ or Ctrl with the wheel zooms the lanes; a plain wheel is left to scroll", async () => {
		render(StudioTimeline);
		expect(clipEl("c1").style.left).toBe("80px");
		await fireEvent.wheel(timeline(), { deltaY: -100 });
		expect(clipEl("c1").style.left).toBe("80px");
		const zoom = new WheelEvent("wheel", {
			deltaY: -100,
			ctrlKey: true,
			bubbles: true,
			cancelable: true,
		});
		await fireEvent(timeline(), zoom);
		expect(zoom.defaultPrevented).toBe(true);
		expect(clipEl("c1").style.left).toBe("92px");
		expect(clipEl("c1").style.width).toBe("184px");
		await fireEvent.wheel(timeline(), { deltaY: 100, metaKey: true });
		// Back to 40 px a second, give or take a float's tail.
		expect(parseFloat(clipEl("c1").style.left)).toBeCloseTo(80, 6);
	});

	test("the playhead sits at the engine's position past the headers", () => {
		fake.position = 5;
		render(StudioTimeline);
		expect(playhead().style.left).toBe(`${xAt(5)}px`);
	});

	test("while recording, an armed track grows a band from where the pass began and the controls lock", () => {
		fake.phase = "recording";
		fake.recordFrom = 2;
		fake.position = 5;
		render(StudioTimeline);
		const band = document.querySelector(".border-red-500") as HTMLElement;
		expect(band.style.left).toBe("80px");
		expect(band.style.width).toBe("120px");
		expect(band.querySelector("canvas")).toBeInTheDocument();
		expect(fake.livePeaksOf).toHaveBeenCalledWith("t1");
		// Only the armed track records.
		expect(document.querySelectorAll(".border-red-500")).toHaveLength(1);
		expect(screen.getByRole("button", { name: "Arm Track 1 for recording" })).toBeDisabled();
		expect(screen.getByRole("combobox", { name: "Track 1 input" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Mute Track 1" })).toBeEnabled();
	});

	test("idle, no band is drawn", () => {
		render(StudioTimeline);
		expect(document.querySelector(".border-red-500")).toBeNull();
		expect(fake.livePeaksOf).not.toHaveBeenCalled();
	});
});
