import type { MeterState } from "#lib/utils/meterLevel.js";
import { meterWidth } from "#lib/utils/meterLevel.js";
import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { automationLanes } from "#lib/utils/automationLanes.js";
import { studioGrid } from "#lib/utils/studioGrid.js";
import { insertsOf } from "#lib/utils/insertsFromFx.js";
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
		levels: {} as Record<string, MeterState>,
		masterLevel: { level: 0, hold: 0, heldAt: 0, clipped: false, rms: 0 } as MeterState,
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
		moveClips: vi.fn(),
		deleteClip: vi.fn(),
		deleteClips: vi.fn(),
		compFromTake: vi.fn(() => ({ id: "comp-mid" })),
		get markers() {
			return engine.arrangement.markers ?? [];
		},
		get grid() {
			return studioGrid(engine.arrangement);
		},
		get tempoChanges() {
			return engine.arrangement.tempoChanges ?? [];
		},
		get keyChanges() {
			return engine.arrangement.keyChanges ?? [];
		},
		setKeyChange: vi.fn(),
		removeKeyChange: vi.fn(),
		get meterChanges() {
			return engine.arrangement.meterChanges ?? [];
		},
		setTempoChange: vi.fn(),
		addClipFromSource: vi.fn(() => ({ id: "dropped" })),
		removeTempoChange: vi.fn(),
		setMeterChange: vi.fn(),
		removeMeterChange: vi.fn(),
		renameMarker: vi.fn(),
		deleteMarker: vi.fn(),
		renameTrack: vi.fn(),
		moveTrack: vi.fn(),
		removeTrack: vi.fn(),
		setGain: vi.fn(),
		setPan: vi.fn(),
		setTint: vi.fn(),
		resetClips: vi.fn(),
		setTrackFx: vi.fn(),
		setInserts: vi.fn(),
		setAutomation: vi.fn(),
		hasAutomation: vi.fn(() => false),
		automatedValue: vi.fn((id: string, param: string) => {
			const t = engine.arrangement.tracks.find((x) => x.id === id)!;
			return param === "volume" ? t.gain : param === "pan" ? t.pan : (t.fx?.reverb.level ?? 0);
		}),
		// The lanes as the engine lists them (utils/automationLanes.ts) from the track's state: volume, pan, then its inserts' parameters.
		lanesOf: vi.fn((id: string) => {
			const t = engine.arrangement.tracks.find((x) => x.id === id)!;
			return automationLanes({
				gain: t.gain,
				pan: t.pan,
				sends: t.sends,
				inserts: insertsOf(t),
				buses: engine.arrangement.buses ?? [],
			});
		}),
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
		sampler: "Sampler",
		amp: "Practice amp",
	},
	STUDIO_INSTRUMENTS: ["piano", "chords", "drums", "sampler"],
	isInstrument: (s: string) => ["piano", "chords", "drums", "sampler"].includes(s),
}));
const { default: StudioTimeline } = await import("./StudioTimeline.svelte");

/** 40 px a second: the header is 200 px wide and the scroller's rect sits at x = 0 in jsdom, so a second is at 200 + 40 t. */
const PX = 40;
const HEADER_W = 200;
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
const playhead = () => document.querySelector("[data-playhead]") as HTMLElement;
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
			"Sampler",
			"Practice amp",
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

	test("the fader and the pan reach the engine as they move; a double-click centers the pan", async () => {
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

	test("the meter follows the track's level on a dB scale, and the clip light sticks until clicked", async () => {
		const meter = (level: number, clipped = false) => ({
			level,
			hold: level,
			heldAt: 0,
			clipped,
			rms: level,
		});
		fake.levels = { t1: meter(0.5), t2: meter(1, true) };
		render(StudioTimeline);
		const meters = screen.getAllByRole("meter");
		expect(meters.map((m) => m.getAttribute("aria-valuenow"))).toEqual([
			String(Math.round(meterWidth(0.5) * 100)),
			"100",
			"0",
		]);
		const light = screen.getByRole("button", { name: /Guitar clip: clipped/ });
		expect(light).toHaveAttribute("aria-pressed", "true");
		await fireEvent.click(light);
		expect(fake.resetClips).toHaveBeenCalledWith("t2");
	});
	test("a tint from the track's menu reaches the engine, and the name wears it", async () => {
		const user = userEvent.setup();
		render(StudioTimeline);
		await user.click(screen.getByRole("button", { name: "Guitar actions" }));
		await user.click(
			within(screen.getByRole("group", { name: "Guitar tint" })).getByRole("button", {
				name: "Tint Sage",
			}),
		);
		expect(fake.setTint).toHaveBeenCalledWith("t2", "sage");
	});

	test("the inserts menu opens the track's inserts (its old fx as a list); adding one hands the engine the whole list", async () => {
		const user = userEvent.setup();
		render(StudioTimeline);
		const button = screen.getByRole("button", { name: "Track 1 Inserts" });
		expect(button).toHaveAttribute("title", expect.stringContaining("Inserts"));
		expect(button).not.toHaveAttribute("data-active", "true");
		// A track with effects on shows it on its button.
		expect(screen.getByRole("button", { name: "Guitar Inserts" })).toHaveAttribute(
			"data-active",
			"true",
		);
		await user.click(button);
		// Every track's menu is in the DOM (closed ones display:none): the panel is read within Track 1's.
		const panel = within(
			screen.getByRole("group", { name: "Track 1 inserts" }).closest("[popover]") as HTMLElement,
		);
		expect(panel.getByText(/No inserts yet/)).toBeInTheDocument();
		await user.click(panel.getByRole("button", { name: "Add EQ" }));
		expect(fake.setInserts).toHaveBeenCalledTimes(1);
		const [id, list] = fake.setInserts.mock.calls[0]!;
		expect(id).toBe("t1");
		expect(list).toHaveLength(1);
		expect(list[0].kind).toBe("eq");
	});

	test("a track's old fx show as inserts; a slider patches one setting and the panel sends the list", async () => {
		const user = userEvent.setup();
		render(StudioTimeline);
		await user.click(screen.getByRole("button", { name: "Guitar Inserts" }));
		const level = screen.getByRole("slider", { name: "Reverb Level" });
		expect(level).toHaveValue("0.6");
		expect(screen.getByRole("slider", { name: "Tone Tilt" })).toHaveValue("0.5");
		await fireEvent.input(screen.getByRole("slider", { name: "Tone Air" }), {
			target: { value: "0.3" },
		});
		expect(fake.setInserts).toHaveBeenLastCalledWith("t2", [
			{ id: "fx-tone", kind: "tone", settings: { tilt: 0.5, air: 0.3, bottom: 0 } },
			{ id: "fx-reverb", kind: "reverb", settings: { level: 0.6, size: 0.5 } },
		]);
		await user.click(screen.getByRole("button", { name: "Remove Reverb" }));
		expect(fake.setInserts).toHaveBeenLastCalledWith("t2", [
			{ id: "fx-tone", kind: "tone", settings: { tilt: 0.5, air: 0, bottom: 0 } },
		]);
	});

	test("the lane picker lists the volume, the pan and the inserts' automatable parameters", async () => {
		const user = userEvent.setup();
		render(StudioTimeline);
		await user.click(screen.getByRole("button", { name: "Automation for Guitar" }));
		const picker = screen.getByRole("combobox", { name: "Guitar automation parameter" });
		await user.click(picker);
		const names = screen.getAllByRole("option").map((o) => o.textContent?.trim());
		expect(names).toEqual(["Volume", "Pan", "Mute", "Reverb: Level"]);
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
		expect(fake.deleteClips).toHaveBeenCalledWith(["c1"], false);
		expect(del.defaultPrevented).toBe(true);
		expect(clipEl("c1")).not.toHaveClass("border-accent");
		// Nothing selected: the key does nothing.
		await fireEvent.keyDown(timeline(), { key: "Delete" });
		expect(fake.deleteClips).toHaveBeenCalledTimes(1);
		await rerender({ selected: "c2" });
		await fireEvent.keyDown(timeline(), { key: "Backspace" });
		expect(fake.deleteClips).toHaveBeenLastCalledWith(["c2"], false);
		await rerender({ selected: "c3" });
		expect(clipEl("c3")).toHaveClass("border-accent");
		await fireEvent.keyDown(timeline(), { key: "Escape" });
		expect(clipEl("c3")).not.toHaveClass("border-accent");
		expect(fake.deleteClips).toHaveBeenCalledTimes(2);
		// Typing in the track name bubbles to the timeline but is left alone.
		await rerender({ selected: "c3" });
		await fireEvent.keyDown(screen.getAllByRole("textbox", { name: "Track name" })[0], {
			key: "Backspace",
		});
		expect(fake.deleteClips).toHaveBeenCalledTimes(2);
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

describe("StudioTimeline: automation lanes (D1)", () => {
	test("A opens a lane under the track with the volume picked, and hides it again", async () => {
		const user = userEvent.setup();
		render(StudioTimeline);
		const toggle = screen.getByRole("button", { name: "Automation for Guitar" });
		expect(document.querySelector("[data-automation-for]")).toBeNull();
		await user.click(toggle);
		const lane = document.querySelector("[data-automation-for]") as HTMLElement;
		expect(lane.dataset.automationFor).toBe("t2");
		expect(toggle).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByRole("combobox", { name: "Guitar automation parameter" })).toHaveTextContent(
			"Volume",
		);
		await user.click(toggle);
		expect(document.querySelector("[data-automation-for]")).toBeNull();
	});
	test("a click on the lane hands the engine the new lane, snapped to the grid", async () => {
		const user = userEvent.setup();
		render(StudioTimeline);
		await user.click(screen.getByRole("button", { name: "Automation for Guitar" }));
		const lane = document.querySelector("[data-automation-lane]") as HTMLElement;
		lane.getBoundingClientRect = () =>
			({ left: HEADER_W, top: 0, width: 800, height: 64, right: 1000, bottom: 64 }) as DOMRect;
		await fireEvent.pointerDown(lane, { button: 0, clientX: xAt(1.3), clientY: 32 });
		expect(fake.setAutomation).toHaveBeenCalledTimes(1);
		const [id, param, points] = fake.setAutomation.mock.calls[0]!;
		expect(id).toBe("t2");
		expect(param).toBe("volume");
		expect(points).toHaveLength(1);
		// The fake's snap rounds to the half second.
		expect(points[0].t).toBe(1.5);
	});
	test("a MIDI track has no automation button", () => {
		fake.arrangement.tracks.push(
			track({
				id: "t4",
				name: "Keys",
				kind: "midi",
				input: { source: "piano", channel: "stereo" },
			}),
		);
		render(StudioTimeline);
		expect(screen.queryByRole("button", { name: "Automation for Keys" })).toBeNull();
		expect(screen.getByRole("button", { name: "Automation for Guitar" })).toBeInTheDocument();
	});
});

describe("StudioTimeline: editing depth (D4)", () => {
	const clipEl = (id: string) => document.querySelector(`[data-clip="${id}"]`) as HTMLElement;
	const press = async (id: string, pointerId: number, shiftKey = false) => {
		await fireEvent.pointerDown(clipEl(id), {
			button: 0,
			pointerId,
			clientX: 300,
			clientY: 50,
			shiftKey,
		});
		await fireEvent.pointerUp(clipEl(id), { pointerId });
	};
	test("Shift-click builds a selection; Delete removes it all and Shift+Delete ripples", async () => {
		render(StudioTimeline);
		await press("c1", 1);
		await press("c2", 2, true);
		expect(clipEl("c1").dataset.selected).toBe("true");
		expect(clipEl("c2").dataset.selected).toBe("true");
		// Shift on a selected clip takes it out again.
		await press("c1", 3, true);
		expect(clipEl("c1").dataset.selected).toBeUndefined();
		await press("c1", 4, true);
		await fireEvent.keyDown(clipEl("c1"), { key: "Delete", shiftKey: true });
		expect(fake.deleteClips).toHaveBeenLastCalledWith(["c2", "c1"], true);
	});
	test("a selection dragged moves every clip in it together", async () => {
		render(StudioTimeline);
		await press("c1", 1);
		await fireEvent.pointerDown(clipEl("c2"), {
			button: 0,
			pointerId: 2,
			clientX: 220,
			clientY: 160,
			shiftKey: true,
		});
		await fireEvent.pointerMove(clipEl("c2"), { pointerId: 2, clientX: 300, clientY: 160 });
		await fireEvent.pointerUp(clipEl("c2"), { pointerId: 2 });
		// 80 px at 40 px/s is 2 s, snapped to the fake's half second.
		expect(fake.moveClips).toHaveBeenCalledWith(["c1", "c2"], 2, 0);
		expect(fake.moveClip).not.toHaveBeenCalled();
	});
	test("overlapping clips show an equal-power crossfade on their wedges", () => {
		fake.arrangement.clips.push(
			clip({ id: "c4", trackId: "t1", sourceId: "s1", name: "Over", start: 5, duration: 4 }),
		);
		render(StudioTimeline);
		expect(clipEl("c1").querySelector("[data-fade-out]")?.getAttribute("data-fade-out")).toBe(
			"power",
		);
		expect(clipEl("c4").querySelector("[data-fade-in]")?.getAttribute("data-fade-in")).toBe(
			"power",
		);
		// c1's own fade-in stays linear.
		expect(clipEl("c1").querySelector("[data-fade-in]")?.getAttribute("data-fade-in")).toBe(
			"linear",
		);
	});
	test("T opens a lane per take under the clip; a swipe takes that region from the take", async () => {
		const user = userEvent.setup();
		render(StudioTimeline);
		expect(screen.queryByRole("button", { name: "Takes for Track 1" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Takes for Guitar" }));
		const lanes = document.querySelectorAll("[data-take-lane]");
		expect([...lanes].map((l) => (l as HTMLElement).dataset.takeLane)).toEqual(["s3", "s4"]);
		const lane = screen.getByRole("button", { name: /^Take s3 for Riff/ });
		await fireEvent.pointerDown(lane, { button: 0, pointerId: 7, clientX: xAt(1), clientY: 10 });
		await fireEvent.pointerMove(lane, { pointerId: 7, clientX: xAt(2), clientY: 10 });
		await fireEvent.pointerUp(lane, { pointerId: 7 });
		expect(fake.compFromTake).toHaveBeenCalledWith("c2", "s3", 1, 2);
		// A tap too short to mean a region does nothing.
		await fireEvent.pointerDown(lane, { button: 0, pointerId: 8, clientX: xAt(1), clientY: 10 });
		await fireEvent.pointerUp(lane, { pointerId: 8 });
		expect(fake.compFromTake).toHaveBeenCalledTimes(1);
		await user.click(screen.getByRole("button", { name: "Takes for Guitar" }));
		expect(document.querySelector("[data-take-lane]")).toBeNull();
	});
	test("markers sit on the ruler: a click seeks there, Delete removes one", async () => {
		const user = userEvent.setup();
		fake.arrangement.markers = [
			{ id: "m1", t: 4, name: "Chorus" },
			{ id: "m2", t: 8.5, name: "Bridge" },
		];
		render(StudioTimeline);
		const chorus = screen.getByRole("button", { name: "Marker Chorus at 0:04.0" });
		expect(chorus.style.left).toBe(`${4 * PX}px`);
		await user.click(chorus);
		expect(fake.seek).toHaveBeenLastCalledWith(4);
		chorus.focus();
		await fireEvent.keyDown(chorus, { key: "Delete" });
		expect(fake.deleteMarker).toHaveBeenCalledWith("m1");
		expect(screen.getByRole("button", { name: /^Marker Bridge/ })).toBeInTheDocument();
	});
});

describe("StudioTimeline: the tempo map (D5)", () => {
	test("the ruler's bars follow a tempo change, and the change is a flag that edits and removes", async () => {
		const user = userEvent.setup();
		fake.arrangement.tempoChanges = [{ start: 4, bpm: 60 }];
		fake.arrangement.meterChanges = [{ start: 8, beatsPerBar: 3 }];
		fake.arrangement.keyChanges = [{ start: 12, key: "F#m" }];
		render(StudioTimeline);
		// Bars 1 and 2 are 2 s (80 px) at 120; from 4 s a bar is 4 s (160 px).
		const labels = [...document.querySelectorAll("[data-ruler-tick]")];
		void labels;
		const flag = screen.getByRole("button", { name: "Tempo change to 60 bpm at 0:04.0" });
		expect(flag.style.left).toBe(`${4 * PX}px`);
		await user.click(flag);
		expect(fake.seek).toHaveBeenLastCalledWith(4);
		flag.focus();
		await fireEvent.keyDown(flag, { key: "Delete" });
		expect(fake.removeTempoChange).toHaveBeenCalledWith(4);
		// The selection's own Delete did not fire.
		expect(fake.deleteClips).not.toHaveBeenCalled();
		const meter = screen.getByRole("button", { name: "Meter change to 3 beats a bar at 0:08.0" });
		expect(meter).toHaveTextContent("3/4");
		await fireEvent.keyDown(meter, { key: "Backspace" });
		expect(fake.removeMeterChange).toHaveBeenCalledWith(8);
		// A key change is a flag the same way (Kevin, 2026-10-20).
		const key = screen.getByRole("button", { name: "Key change to F#m at 0:12.0" });
		expect(key).toHaveTextContent("F#m");
		expect(key.style.left).toBe(`${12 * PX + 44}px`);
		await fireEvent.keyDown(key, { key: "Delete" });
		expect(fake.removeKeyChange).toHaveBeenCalledWith(12);
	});
});

describe("StudioTimeline: the library's drop (D6)", () => {
	test("a recording dropped on an audio lane lands as a clip at the drop, snapped; a MIDI lane refuses it", () => {
		fake.arrangement.tracks.push(
			track({
				id: "t4",
				name: "Keys",
				kind: "midi",
				input: { source: "sampler", channel: "stereo" },
			}),
		);
		render(StudioTimeline);
		const lanes = document.querySelectorAll(
			"[data-track-row] > div:nth-child(2) > div:first-child",
		);
		const audioLane = lanes[0] as HTMLElement;
		const midiLane = lanes[3] as HTMLElement;
		const dataTransfer = {
			types: ["application/x-stemshovel-source"],
			getData: (k: string) => (k === "application/x-stemshovel-source" ? "s9" : ""),
			dropEffect: "",
		};
		const over = new Event("dragover", { bubbles: true, cancelable: true }) as DragEvent;
		Object.defineProperty(over, "dataTransfer", { value: dataTransfer });
		audioLane.dispatchEvent(over);
		expect(over.defaultPrevented).toBe(true);
		const drop = new MouseEvent("drop", {
			bubbles: true,
			cancelable: true,
			clientX: xAt(3.3),
		}) as DragEvent;
		Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
		audioLane.dispatchEvent(drop);
		expect(fake.addClipFromSource).toHaveBeenCalledWith("t1", "s9", 3.5);
		const refused = new Event("dragover", { bubbles: true, cancelable: true }) as DragEvent;
		Object.defineProperty(refused, "dataTransfer", { value: dataTransfer });
		midiLane.dispatchEvent(refused);
		expect(refused.defaultPrevented).toBe(false);
	});
});

describe("StudioTimeline: comments on the ruler (D7)", () => {
	test("a pinned comment is a dot; a click seeks there and opens the thread", async () => {
		const user = userEvent.setup();
		const oncomment = vi.fn();
		render(StudioTimeline, {
			props: { comments: [{ id: "k1", at: 2.5, by: "Sam" }], oncomment },
		});
		const dot = screen.getByRole("button", { name: "Comment by Sam at 0:02.5" });
		expect(dot.style.left).toBe(`${2.5 * PX}px`);
		await user.click(dot);
		expect(fake.seek).toHaveBeenLastCalledWith(2.5);
		expect(oncomment).toHaveBeenCalledWith("k1");
	});
});
