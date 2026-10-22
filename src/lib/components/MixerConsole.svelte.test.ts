import type { MeterState } from "#lib/utils/meterLevel.js";
import { METER_ZERO } from "#lib/utils/meterLevel.js";
import type { StudioArrangement, StudioTrack } from "#lib/val/StudioSchema.js";
import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { fireEvent, render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The mixer console over a stand-in engine (as StudioTimeline's test): a
 * strip per track, bus and master; the fader, pan, mute, solo, output,
 * sends and inserts each call the engine; Add bus and Remove bus too.
 */
const fake = vi.hoisted(() => {
	const engine = {
		arrangement: null as unknown as StudioArrangement,
		levels: {} as Record<string, MeterState>,
		masterLevel: { level: 0, hold: 0, heldAt: 0, clipped: false, rms: 0 } as MeterState,
		get anySolo() {
			return engine.arrangement.tracks.some((t) => t.solo);
		},
		automatedValue: vi.fn((id: string, key: string) => {
			const track = engine.arrangement.tracks.find((x) => x.id === id);
			// The master is an owner too: its fader reads through the same call.
			if (id === "master") return key === "volume" ? engine.arrangement.master : 0;
			const owner = track ?? engine.arrangement.buses?.find((b) => b.id === id);
			if (!owner) return 0;
			if (key === "volume") return owner.gain;
			if (key === "pan") return owner.pan;
			const send = /^send:(.+)$/.exec(key);
			if (send) return track?.sends?.find((s) => s.bus === send[1])?.level ?? 0;
			return 0;
		}),
		setGain: vi.fn(),
		setPan: vi.fn(),
		toggleMute: vi.fn(),
		toggleSolo: vi.fn(),
		resetClips: vi.fn(),
		setInserts: vi.fn(),
		setMaster: vi.fn(),
		addBus: vi.fn(),
		removeBus: vi.fn(),
		renameBus: vi.fn(),
		setBusGain: vi.fn(),
		setBusPan: vi.fn(),
		toggleBusMute: vi.fn(),
		setBusTint: vi.fn(),
		setOutput: vi.fn(),
		setSend: vi.fn(),
	};
	return engine;
});
vi.mock("#lib/audio/studio.svelte.js", () => ({ studio: fake }));
const { default: MixerConsole } = await import("./MixerConsole.svelte");

function track(over: Partial<StudioTrack> & { id: string; name: string }): StudioTrack {
	return { gain: 1, pan: 0, muted: false, solo: false, armed: false, input: null, ...over };
}
function fixture(): StudioArrangement {
	return {
		version: 1,
		bpm: 120,
		beatsPerBar: 4,
		gridOn: true,
		countIn: false,
		click: false,
		loop: null,
		master: 0.8,
		tracks: [
			track({ id: "t1", name: "Guitar", gain: 0.5, pan: -0.5 }),
			track({
				id: "t2",
				name: "Keys",
				kind: "midi",
				input: { source: "piano", channel: "stereo" },
				output: "b1",
				sends: [{ bus: "b1", level: 0.4 }],
			}),
			track({
				id: "t3",
				name: "Vocal",
				inserts: [{ id: "i1", kind: "reverb", settings: { level: 0.3, size: 0.5 } }],
				sends: [{ bus: "b1", level: 0.25 }],
			}),
		],
		clips: [],
		buses: [{ id: "b1", name: "Drums", gain: 0.9, pan: 0.2, muted: false, colour: "sea" }],
		masterInserts: [{ id: "m1", kind: "limiter", settings: { ceiling: -1, release: 0.1 } }],
	};
}

beforeAll(() => {
	installFakePopover();
	// jsdom cannot scroll an option into view.
	if (!("scrollIntoView" in Element.prototype))
		Object.assign(Element.prototype, { scrollIntoView() {} });
});
beforeEach(() => {
	vi.clearAllMocks();
	fake.arrangement = fixture();
	fake.levels = { t1: { ...METER_ZERO, level: 0.5 }, b1: { ...METER_ZERO, level: 0.2 } };
});

describe("MixerConsole", () => {
	test("a strip per track, per bus and the master, with the faders and pans at their values", () => {
		render(MixerConsole);
		expect(screen.getByRole("region", { name: "Guitar strip" })).toBeInTheDocument();
		expect(screen.getByRole("region", { name: "Keys strip" })).toBeInTheDocument();
		expect(screen.getByRole("region", { name: "Drums bus strip" })).toBeInTheDocument();
		expect(screen.getByRole("region", { name: "Master strip" })).toBeInTheDocument();
		expect(screen.getByRole("slider", { name: "Guitar level" })).toHaveValue("0.5");
		expect(screen.getByRole("slider", { name: "Guitar pan" })).toHaveAttribute(
			"aria-valuenow",
			"-0.5",
		);
		expect(screen.getByRole("slider", { name: "Drums level" })).toHaveValue("0.9");
		expect(screen.getByRole("slider", { name: "Master level" })).toHaveValue("0.8");
		// A MIDI track has no output, inserts or sends: its instrument carries the sound.
		const keys = within(screen.getByRole("region", { name: "Keys strip" }));
		expect(keys.queryByRole("combobox", { name: "Keys output" })).toBeNull();
		expect(keys.getByText(/its instrument carries the sound/)).toBeInTheDocument();
		// The meters: a track's, a bus's, the master's.
		expect(screen.getByRole("meter", { name: "Guitar level" })).toBeInTheDocument();
		expect(screen.getByRole("meter", { name: "Drums level" })).toBeInTheDocument();
		expect(screen.getByRole("meter", { name: "Master level" })).toBeInTheDocument();
	});

	test("the fader, pan, mute and solo of a track call the engine; the master fader too", async () => {
		const user = userEvent.setup();
		render(MixerConsole);
		await fireEvent.input(screen.getByRole("slider", { name: "Guitar level" }), {
			target: { value: "0.75" },
		});
		expect(fake.setGain).toHaveBeenLastCalledWith("t1", 0.75);
		await user.click(screen.getByRole("button", { name: "Mute Guitar" }));
		expect(fake.toggleMute).toHaveBeenCalledWith("t1");
		await user.click(screen.getByRole("button", { name: "Solo Guitar" }));
		expect(fake.toggleSolo).toHaveBeenCalledWith("t1");
		await fireEvent.input(screen.getByRole("slider", { name: "Master level" }), {
			target: { value: "0.6" },
		});
		expect(fake.setMaster).toHaveBeenLastCalledWith(0.6);
	});

	test("the output picker routes a track to a bus or back to the master", async () => {
		const user = userEvent.setup();
		fake.arrangement.tracks[2]!.output = "b1";
		render(MixerConsole);
		const guitar = screen.getByRole("combobox", { name: "Guitar output" });
		expect(guitar).toHaveTextContent("Master");
		await user.click(guitar);
		await user.click(
			within(screen.getByRole("listbox", { name: "Guitar output" })).getByRole("option", {
				name: "Drums",
			}),
		);
		expect(fake.setOutput).toHaveBeenLastCalledWith("t1", "b1");
		const vocal = screen.getByRole("combobox", { name: "Vocal output" });
		expect(vocal).toHaveTextContent("Drums");
		await user.click(vocal);
		await user.click(
			within(screen.getByRole("listbox", { name: "Vocal output" })).getByRole("option", {
				name: "Master",
			}),
		);
		expect(fake.setOutput).toHaveBeenLastCalledWith("t3", null);
	});

	test("a send knob per bus on each audio track, at the send's level", () => {
		render(MixerConsole);
		expect(screen.getByRole("slider", { name: "Vocal send to Drums" })).toHaveAttribute(
			"aria-valuenow",
			"0.25",
		);
		expect(screen.getByRole("slider", { name: "Guitar send to Drums" })).toHaveAttribute(
			"aria-valuenow",
			"0",
		);
		expect(screen.queryByRole("slider", { name: "Keys send to Drums" })).toBeNull();
	});

	test("the inserts menu of a track, a bus and the master each hand the engine the owner's list", async () => {
		const user = userEvent.setup();
		render(MixerConsole);
		await user.click(screen.getByRole("button", { name: "Vocal inserts" }));
		expect(screen.getByRole("slider", { name: "Reverb Level" })).toHaveValue("0.3");
		await user.click(screen.getByRole("button", { name: "Add EQ" }));
		expect(fake.setInserts).toHaveBeenCalledTimes(1);
		expect(fake.setInserts.mock.calls[0]![0]).toBe("t3");
		expect(fake.setInserts.mock.calls[0]![1]).toHaveLength(2);
		await user.click(screen.getByRole("button", { name: "Master inserts" }));
		await user.click(screen.getByRole("button", { name: "Remove Limiter" }));
		expect(fake.setInserts).toHaveBeenLastCalledWith("master", []);
		await user.click(screen.getByRole("button", { name: "Drums inserts" }));
		const drums = within(
			screen.getByRole("group", { name: "Drums inserts" }).closest("[popover]") as HTMLElement,
		);
		await user.click(drums.getByRole("button", { name: "Add Compressor" }));
		expect(fake.setInserts.mock.calls.at(-1)![0]).toBe("b1");
	});

	test("a bus renames, mutes, tints and goes; Add bus asks the engine for one", async () => {
		const user = userEvent.setup();
		render(MixerConsole);
		const name = screen.getByRole("textbox", { name: "Bus name" });
		expect(name).toHaveValue("Drums");
		await fireEvent.change(name, { target: { value: "Drum bus" } });
		expect(fake.renameBus).toHaveBeenCalledWith("b1", "Drum bus");
		await user.click(screen.getByRole("button", { name: "Mute Drums" }));
		expect(fake.toggleBusMute).toHaveBeenCalledWith("b1");
		await fireEvent.input(screen.getByRole("slider", { name: "Drums level" }), {
			target: { value: "0.5" },
		});
		expect(fake.setBusGain).toHaveBeenLastCalledWith("b1", 0.5);
		await user.click(screen.getByRole("button", { name: "Drums actions" }));
		await user.click(screen.getByRole("button", { name: "No tint" }));
		expect(fake.setBusTint).toHaveBeenCalledWith("b1", null);
		await user.click(screen.getByRole("button", { name: "Remove bus" }));
		expect(fake.removeBus).toHaveBeenCalledWith("b1");
		await user.click(screen.getByRole("button", { name: "Add bus" }));
		expect(fake.addBus).toHaveBeenCalledTimes(1);
	});
});
