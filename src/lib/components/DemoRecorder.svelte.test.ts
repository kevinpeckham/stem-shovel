import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { tick, type ComponentProps } from "svelte";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The Idea Recorder's take recorder on stand-ins for everything jsdom lacks:
 * an AudioContext whose nodes connect to nothing, a MediaRecorder that hands
 * back one chunk on stop, a microphone from getUserMedia, blob: URLs, and the
 * shared inputs module (src/lib/audio/inputs.svelte.ts) as a fake that
 * remembers which sources are open. That covers the device's chrome, the
 * source buttons, the ⋯ menu, the fields, a loaded take and a Record → Stop
 * cycle; the meters, decoding and playback itself need real Web Audio and are
 * left to the browser (docs/testing.md).
 */
const fakeInputs = vi.hoisted(() => {
	const open = new Set<string>();
	const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
	const inputs = {
		levels: { mic: 0, line: 0, computer: 0 } as Record<string, number>,
		labels: {} as Record<string, string | null>,
		errors: {} as Record<string, string | null>,
		inputs: [] as { id: string; label: string }[],
		deviceIds: { mic: null, line: null } as Record<string, string | null>,
		channelModes: { mic: "stereo", line: "stereo", computer: "stereo" } as Record<string, string>,
		inputGainsDb: { mic: 0, line: 0, computer: 0 } as Record<string, number>,
		computerLatencyMs: 0,
		normalize: false,
		monitor: false,
		latencyMs: 0,
		latencyMeasured: false,
		calibrating: false,
		context: null as unknown,
		attach: vi.fn((ctx: unknown) => {
			inputs.context = ctx;
		}),
		detach: vi.fn(() => {
			inputs.context = null;
		}),
		has: (s: string) => open.has(s),
		output: (s: string) => (open.has(s) ? node() : null),
		requestInput: vi.fn(async (s: string) => {
			open.add(s);
			inputs.labels[s] = "USB Interface";
			return true;
		}),
		requestComputer: vi.fn(async () => {
			open.add("computer");
			inputs.labels.computer = "Shared audio";
			return true;
		}),
		stop: vi.fn((s: string) => {
			open.delete(s);
			inputs.labels[s] = null;
		}),
		listInputs: vi.fn(async () => {}),
		calibrate: vi.fn(async () => null),
		setDevice: vi.fn(),
		setChannelMode: vi.fn(),
		setInputGainDb: vi.fn(),
		setComputerLatencyMs: vi.fn(),
		setLatencyMs: vi.fn(),
		setNormalize: vi.fn(),
		setMonitor: vi.fn(),
		reset() {
			open.clear();
			inputs.labels = {};
			inputs.errors = {};
			inputs.context = null;
			inputs.normalize = false;
			for (const f of [
				inputs.attach,
				inputs.detach,
				inputs.requestInput,
				inputs.requestComputer,
				inputs.stop,
			])
				f.mockClear();
		},
	};
	return inputs;
});
vi.mock("#lib/audio/inputs.svelte.js", () => ({
	inputSources: fakeInputs,
	OUTSIDE_SOURCE_LABELS: { mic: "Microphone", line: "Line in", computer: "Computer" },
	outputLatencyMs: () => 0,
}));
// The instruments' engines (their volume sliders are all the recorder reads) and the Blob upload helper stay out.
vi.mock("#lib/audio/piano.svelte.js", () => ({ piano: { volume: 0.8, setVolume: vi.fn() } }));
vi.mock("#lib/audio/drumMachine.svelte.js", () => ({
	drumMachine: { volume: 0.6, setVolume: vi.fn() },
}));
vi.mock("#lib/upload.js", () => ({ saveAs: vi.fn(async () => {}) }));

const { default: DemoRecorder } = await import("./DemoRecorder.svelte");
type Take = NonNullable<ComponentProps<typeof DemoRecorder>["takes"]>[number];

// ---- the browser's audio, stood in for ----
const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
function fakeStream(label: string): MediaStream {
	const track = {
		label,
		getSettings: () => ({ sampleRate: 48000, channelCount: 1 }),
		stop: vi.fn(),
		onended: null,
	};
	return { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
}
class FakeAudioContext {
	static made = 0;
	state = "running";
	currentTime = 0;
	sampleRate = 48000;
	baseLatency = 0;
	destination = {};
	constructor() {
		FakeAudioContext.made++;
	}
	createMediaStreamSource = () => node();
	createGain = () => ({ ...node(), gain: { value: 1, setTargetAtTime() {} } });
	createAnalyser = () => ({
		...node(),
		fftSize: 2048,
		getFloatTimeDomainData: (buf: Float32Array) => buf.fill(0),
	});
	createMediaStreamDestination = () => ({ ...node(), stream: fakeStream("mix") });
	decodeAudioData = vi.fn(async () => {
		throw new Error("no decoding in jsdom");
	});
	resume = async () => {};
	close = async () => {};
}
class FakeOfflineAudioContext {
	decodeAudioData = async () => {
		throw new Error("no decoding in jsdom");
	};
}
class FakeMediaRecorder {
	static isTypeSupported = vi.fn((type: string) => type === "audio/mp4; codecs=alac");
	static last: FakeMediaRecorder | null = null;
	state = "inactive";
	ondataavailable: ((e: { data: Blob }) => void) | null = null;
	onstop: (() => void) | null = null;
	constructor(
		public stream: MediaStream,
		public options: MediaRecorderOptions,
	) {
		FakeMediaRecorder.last = this;
	}
	start = vi.fn(() => {
		this.state = "recording";
	});
	// Stop hands over one chunk and then reports the stop, as a browser does once the last chunk is in.
	stop = vi.fn(() => {
		this.state = "inactive";
		this.ondataavailable?.({ data: new Blob([new Uint8Array(2048)], { type: "audio/mp4" }) });
		this.onstop?.();
	});
}
const getUserMedia = vi.fn(async () => fakeStream("Built-in Microphone"));
let now = 0;

beforeAll(() => {
	installFakePopover();
	vi.stubGlobal("AudioContext", FakeAudioContext);
	vi.stubGlobal("OfflineAudioContext", FakeOfflineAudioContext);
	vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })),
	);
	Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
	URL.createObjectURL = vi.fn(() => `blob:take-${++blobs}`);
	URL.revokeObjectURL = vi.fn();
	vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => {});
	vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
	vi.spyOn(performance, "now").mockImplementation(() => now);
	// jsdom has no canvas (the waveform draws nothing) and no scrollIntoView (the take dropdown's highlight).
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
	if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});
let blobs = 0;
afterAll(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
beforeEach(() => {
	fakeInputs.reset();
	FakeAudioContext.made = 0;
	FakeMediaRecorder.last = null;
	getUserMedia.mockClear();
	now = 0;
});

// ---- props ----
type Props = ComponentProps<typeof DemoRecorder>;
/** Props with an accessor for `ideaTitle`, so the component's `bind:ideaTitle` writes reach the test. */
function props(extra: Partial<Props> = {}) {
	let ideaTitle = extra.ideaTitle ?? "Morning idea";
	return {
		onqueued: vi.fn(),
		ontitlechange: vi.fn(),
		...extra,
		get ideaTitle() {
			return ideaTitle;
		},
		set ideaTitle(v: string) {
			ideaTitle = v;
		},
	};
}
const allOff = {
	mic: false,
	line: false,
	computer: false,
	piano: false,
	chords: false,
	drums: false,
};
const take = (over: Partial<Take> = {}): Take => ({
	id: "t1",
	takeNumber: 3,
	title: "",
	url: "https://blob/t1.m4a",
	playbackUrl: null,
	codec: "alac",
	durationSeconds: 12,
	...over,
});
const sources = () => screen.getByRole("group", { name: "Sources in the take" });
/** A source's own button (not its settings trigger, which is "<label> settings"). */
const sourceButton = (label: string) =>
	within(sources()).getByRole("button", {
		name: (n) => n.startsWith(label) && !n.includes("settings"),
	});
const menuItem = (name: string | RegExp) => screen.getByRole("button", { name });
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: "More actions" }));
}
const status = () => document.querySelector("[role=status]")?.textContent?.trim() ?? null;

describe("DemoRecorder: the plain recorder (no sources)", () => {
	test("renders the title, Take 1, an enabled Record, the microphone's meter and the transport disabled", () => {
		render(DemoRecorder, { props: props() });
		expect(screen.getByRole("textbox", { name: "Idea Title" })).toHaveValue("Morning idea");
		expect(screen.getByText("Take 1")).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "Take label" })).toHaveAttribute(
			"placeholder",
			"Label the next take (optional)",
		);
		const record = screen.getByRole("button", { name: "Record" });
		expect(record).toBeEnabled();
		expect(record).toHaveAttribute("title", "Record a take");
		const meter = screen.getByRole("meter", { name: "Input level" });
		expect(meter).toHaveAttribute("aria-valuenow", "0");
		expect(meter).toHaveAttribute("aria-valuemax", "100");
		expect(screen.queryByRole("group", { name: "Sources in the take" })).toBeNull();
		expect(screen.getByText("Ready")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Play the take" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Go back to the beginning" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Toggle looping playback mode" })).toBeDisabled();
		expect(screen.getByRole("slider", { name: "Position" })).toBeDisabled();
		expect(screen.getByRole("slider", { name: "Take position" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		expect(screen.queryByRole("alert")).toBeNull();
		expect(document.querySelector("audio")).toBeNull();
	});

	test("the title binds both ways and reports a trimmed title on blur", async () => {
		const user = userEvent.setup();
		const p = props();
		render(DemoRecorder, { props: p });
		const title = screen.getByRole("textbox", { name: "Idea Title" });
		await user.clear(title);
		await user.type(title, "  Riff in D ");
		expect(p.ideaTitle).toBe("  Riff in D ");
		await user.tab();
		expect(p.ontitlechange).toHaveBeenCalledWith("Riff in D");
	});

	test("Enter in the title field blurs it, which commits the title", async () => {
		const user = userEvent.setup();
		const p = props();
		render(DemoRecorder, { props: p });
		const title = screen.getByRole("textbox", { name: "Idea Title" });
		await user.type(title, " two{Enter}");
		expect(document.activeElement).not.toBe(title);
		expect(p.ontitlechange).toHaveBeenCalledWith("Morning idea two");
	});

	test("the ⋯ menu lists the actions; song actions, downloads and Delete Take wait for a take; Delete Idea needs its callback", async () => {
		const user = userEvent.setup();
		const onnewidea = vi.fn();
		render(DemoRecorder, {
			props: props({ onaddtosong: vi.fn(), onnewsong: vi.fn(), onaddstems: vi.fn(), onnewidea }),
		});
		await openMenu(user);
		expect(screen.getAllByRole("listitem").map((li) => li.textContent?.trim())).toEqual([
			"Browse All Ideas",
			"",
			"Add to Existing Song",
			"Create New Song",
			"Add Stems to Song",
			"",
			"Download Source",
			"Download MP3",
			"",
			"Delete Take",
			"Delete Idea",
			"",
			"Start New Idea",
		]);
		expect(menuItem("Browse All Ideas")).toHaveAttribute("popovertarget", "idea-search");
		for (const name of [
			"Add to Existing Song",
			"Create New Song",
			"Add Stems to Song",
			"Download Source",
			"Download MP3",
			"Delete Take",
			"Delete Idea",
		])
			expect(menuItem(name)).toBeDisabled();
		expect(menuItem("Download Source")).toHaveAttribute(
			"title",
			"Source file is not yet available",
		);
		expect(menuItem("Download MP3")).toHaveAttribute("title", "The MP3 is not yet available");
		const newIdea = menuItem("Start New Idea");
		expect(newIdea).toBeEnabled();
		await user.click(newIdea);
		expect(onnewidea).toHaveBeenCalledTimes(1);
		// The menu closed with the action.
		expect(screen.queryByRole("button", { name: "Start New Idea" })).toBeNull();
	});

	test("Start New Idea is disabled while there is nothing to leave (newIdeaDisabled)", async () => {
		const user = userEvent.setup();
		const onnewidea = vi.fn();
		render(DemoRecorder, { props: props({ onnewidea, newIdeaDisabled: true }) });
		await openMenu(user);
		const newIdea = menuItem("Start New Idea");
		expect(newIdea).toBeDisabled();
		await user.click(newIdea);
		expect(onnewidea).not.toHaveBeenCalled();
	});

	test("Delete Idea runs its callback when given", async () => {
		const user = userEvent.setup();
		const ondeleteidea = vi.fn();
		render(DemoRecorder, { props: props({ ondeleteidea }) });
		await openMenu(user);
		const item = menuItem("Delete Idea");
		expect(item).toBeEnabled();
		await user.click(item);
		expect(ondeleteidea).toHaveBeenCalledTimes(1);
	});

	test("load() shows the take's number, name, length and codec, enables the transport and the song actions, and tells the page the phase", async () => {
		const user = userEvent.setup();
		const onphase = vi.fn();
		const onaddtosong = vi.fn();
		const onnewsong = vi.fn();
		const ondeletetake = vi.fn();
		const p = props({ onphase, onaddtosong, onnewsong, onaddstems: vi.fn(), ondeletetake });
		const { component } = render(DemoRecorder, { props: p });
		const t = take({ title: "Bridge" });
		component.load(t);
		await tick();
		expect(onphase).toHaveBeenLastCalledWith("saved");
		expect(screen.getByText("Take 3")).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "Take label" })).toHaveValue("Bridge");
		expect(screen.getByRole("textbox", { name: "Take label" })).toHaveAttribute(
			"placeholder",
			"Label this take (optional)",
		);
		// The clock reads 0:00.0 for a take from the list, over its length; the original plays (jsdom's canPlayType says no, so the rendition or the original).
		expect(screen.getByLabelText("Length")).toHaveTextContent("/ 0:12");
		expect(document.querySelector("audio")).toHaveAttribute("src", t.url);
		expect(screen.getByRole("button", { name: "Record" })).toHaveAttribute(
			"title",
			"Record the next take",
		);
		expect(screen.getByRole("button", { name: "Play the take" })).toBeEnabled();
		expect(screen.getByRole("button", { name: "Go back to the beginning" })).toBeEnabled();
		expect(screen.getByRole("button", { name: "Toggle looping playback mode" })).toBeEnabled();
		const position = screen.getByRole("slider", { name: "Position" });
		expect(position).toBeEnabled();
		expect(position).toHaveAttribute("max", "12");
		await openMenu(user);
		expect(menuItem(/^Download Source/)).toHaveTextContent("Download Source ALAC lossless");
		expect(menuItem(/^Download Source/)).toBeEnabled();
		expect(menuItem("Download MP3")).toBeDisabled();
		// No sources on this take: Add Stems stays off.
		expect(menuItem("Add Stems to Song")).toBeDisabled();
		expect(menuItem("Delete Take")).toBeEnabled();
		await user.click(menuItem("Add to Existing Song"));
		expect(onaddtosong).toHaveBeenCalledWith(t);
		await openMenu(user);
		await user.click(menuItem("Create New Song"));
		expect(onnewsong).toHaveBeenCalledWith(t);
		await openMenu(user);
		await user.click(menuItem("Delete Take"));
		expect(ondeletetake).toHaveBeenCalledWith(t);
	});

	test("a take with sources enables Add Stems to Song; one with a rendition enables Download MP3", async () => {
		const user = userEvent.setup();
		const onaddstems = vi.fn();
		const { component } = render(DemoRecorder, { props: props({ onaddstems }) });
		const t = take({
			stems: [{ id: "s1", label: "Guitar" }],
			playbackUrl: "https://blob/t1-play.mp3",
			codec: "flac",
		});
		component.load(t);
		await tick();
		await openMenu(user);
		expect(menuItem("Download MP3")).toBeEnabled();
		expect(menuItem(/^Download Source/)).toHaveTextContent("FLAC lossless");
		const stems = menuItem("Add Stems to Song");
		expect(stems).toBeEnabled();
		await user.click(stems);
		expect(onaddstems).toHaveBeenCalledWith(t);
	});

	test("the take name field reports a trimmed name for a saved take, never for one still uploading", async () => {
		const user = userEvent.setup();
		const ontakename = vi.fn();
		const { component } = render(DemoRecorder, { props: props({ ontakename }) });
		component.load(take());
		await tick();
		const name = screen.getByRole("textbox", { name: "Take label" });
		await user.type(name, " Chorus ");
		await user.tab();
		expect(ontakename).toHaveBeenCalledWith({ id: "t1", title: "Chorus" });
		// A take just made (local:…) shows "Saving..." and its name waits for the upload.
		component.load(take({ id: "local:abc", takeNumber: 0 }));
		await tick();
		expect(screen.getByText("Saving...")).toBeInTheDocument();
		expect(name).toBeDisabled();
		await openMenu(user);
		expect(screen.getByText("Saving… song actions follow in a moment")).toBeInTheDocument();
		expect(menuItem("Delete Take")).toBeDisabled();
	});

	test("with several takes the label is a dropdown, and choosing one reports its id", async () => {
		const user = userEvent.setup();
		const onpick = vi.fn();
		const takes = [
			take({ id: "t1", takeNumber: 1, durationSeconds: 5 }),
			take({ id: "t2", takeNumber: 2, title: "Louder", durationSeconds: 65 }),
		];
		const { component } = render(DemoRecorder, { props: props({ takes, onpick }) });
		expect(screen.queryByRole("combobox")).toBeNull();
		component.load(takes[1]);
		await tick();
		const combo = screen.getByRole("combobox", { name: "Select Take" });
		expect(combo).toHaveTextContent("Take 2 · Louder");
		await user.click(combo);
		const options = screen.getAllByRole("option");
		expect(options.map((o) => o.textContent?.replace(/\s+/g, " ").trim())).toEqual([
			"Take 1 0:05",
			"Take 2 · Louder 1:05",
		]);
		expect(options[1]).toHaveAttribute("aria-selected", "true");
		await user.click(options[0]);
		expect(onpick).toHaveBeenCalledWith("t1");
	});

	test("Play toggles to Pause and the status reads Playing; back to the beginning pauses; reset() empties the player", async () => {
		const user = userEvent.setup();
		const onphase = vi.fn();
		const { component } = render(DemoRecorder, { props: props({ onphase }) });
		component.load(take());
		await tick();
		await user.click(screen.getByRole("button", { name: "Play the take" }));
		expect(screen.getByRole("button", { name: "Pause the take" })).toBeInTheDocument();
		expect(screen.getByText("Playing")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Go back to the beginning" }));
		expect(screen.getByRole("button", { name: "Play the take" })).toBeInTheDocument();
		expect(screen.getByText("Ready")).toBeInTheDocument();
		component.reset();
		await tick();
		expect(onphase).toHaveBeenLastCalledWith("idle");
		expect(screen.getByText("Take 1")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Play the take" })).toBeDisabled();
		expect(document.querySelector("audio")).toBeNull();
	});

	test("resolve() gives a just-made take its server id and number", async () => {
		const { component } = render(DemoRecorder, { props: props({ ondeletetake: vi.fn() }) });
		component.load(take({ id: "local:x", takeNumber: 0 }));
		await tick();
		expect(screen.getByText("Saving...")).toBeInTheDocument();
		component.resolve("local:other", { id: "t9", takeNumber: 9 });
		await tick();
		expect(screen.getByText("Saving...")).toBeInTheDocument();
		component.resolve("local:x", { id: "t9", takeNumber: 9 });
		await tick();
		expect(screen.getByText("Take 9")).toBeInTheDocument();
	});

	test("Record → Stop records the microphone and queues the take with its format and length", async () => {
		const user = userEvent.setup();
		const onqueued = vi.fn();
		const onstart = vi.fn();
		const onphase = vi.fn();
		render(DemoRecorder, { props: props({ onqueued, onstart, onphase }) });
		await user.click(screen.getByRole("button", { name: "Record" }));
		expect(onstart).toHaveBeenCalledTimes(1);
		expect(getUserMedia).toHaveBeenCalledWith({
			audio: {
				echoCancellation: false,
				noiseSuppression: false,
				autoGainControl: false,
				sampleRate: { ideal: 48000 },
				channelCount: { ideal: 1 },
			},
		});
		const stop = await screen.findByRole("button", { name: "Stop" });
		expect(stop).toHaveAttribute("title", "Stop Recording");
		expect(onphase.mock.calls.map((c) => c[0])).toEqual(["requesting", "recording"]);
		expect(screen.getByText("Recording")).toBeInTheDocument();
		expect(screen.getByText("New Take")).toBeInTheDocument();
		expect(screen.getByText("Input: Built-in Microphone")).toBeInTheDocument();
		expect(screen.getByText("ALAC lossless · 48 kHz · mono")).toBeInTheDocument();
		const recorder = FakeMediaRecorder.last!;
		expect(recorder.options).toEqual({ mimeType: "audio/mp4; codecs=alac" });
		expect(recorder.start).toHaveBeenCalledWith(1000);
		expect(FakeAudioContext.made).toBe(1);
		now = 3000;
		await user.click(stop);
		expect(recorder.stop).toHaveBeenCalledTimes(1);
		expect(onqueued).toHaveBeenCalledTimes(1);
		const queued = onqueued.mock.calls[0][0];
		expect(queued).toMatchObject({
			mimeType: "audio/mp4; codecs=alac",
			ext: "m4a",
			codec: "alac",
			name: "",
			durationSeconds: 3,
		});
		expect(queued.localId).toMatch(/^local:/);
		expect(queued.blob.size).toBe(2048);
		expect(onphase).toHaveBeenLastCalledWith("saved");
		expect(screen.getByText("Saving...")).toBeInTheDocument();
		expect(document.querySelector("audio")).toHaveAttribute("src", "blob:take-1");
		expect(screen.getByLabelText("Length")).toHaveTextContent("/ 0:03");
		expect(screen.getByRole("button", { name: "Play the take" })).toBeEnabled();
		expect(screen.getByRole("button", { name: "Record" })).toBeEnabled();
	});

	test("a take named before Record carries its name into the queue", async () => {
		const user = userEvent.setup();
		const onqueued = vi.fn();
		render(DemoRecorder, { props: props({ onqueued }) });
		await user.type(screen.getByRole("textbox", { name: "Take label" }), "First go");
		await user.click(screen.getByRole("button", { name: "Record" }));
		const stop = await screen.findByRole("button", { name: "Stop" });
		now = 2000;
		await user.click(stop);
		expect(onqueued.mock.calls[0][0].name).toBe("First go");
	});

	test("a lossy format asks for the bitrate; compressed quality skips the lossless candidates", async () => {
		const user = userEvent.setup();
		FakeMediaRecorder.isTypeSupported.mockImplementation(() => true);
		render(DemoRecorder, { props: props({ quality: "compressed" }) });
		await user.click(screen.getByRole("button", { name: "Record" }));
		await screen.findByRole("button", { name: "Stop" });
		expect(FakeMediaRecorder.last!.options).toEqual({
			mimeType: "audio/webm;codecs=opus",
			audioBitsPerSecond: 256_000,
		});
		expect(screen.getByText("Opus · 48 kHz · mono")).toBeInTheDocument();
		FakeMediaRecorder.isTypeSupported.mockImplementation((t) => t === "audio/mp4; codecs=alac");
	});

	test("a take shorter than minTakeSeconds is discarded with a notice and nothing is queued", async () => {
		const user = userEvent.setup();
		const onqueued = vi.fn();
		const onphase = vi.fn();
		render(DemoRecorder, { props: props({ onqueued, onphase, minTakeSeconds: 2 }) });
		await user.click(screen.getByRole("button", { name: "Record" }));
		const stop = await screen.findByRole("button", { name: "Stop" });
		now = 1000;
		await user.click(stop);
		expect(onqueued).not.toHaveBeenCalled();
		expect(status()).toBe("Take discarded: shorter than 2 seconds (Recorder settings).");
		expect(onphase).toHaveBeenLastCalledWith("idle");
		expect(screen.getByText("Take 1")).toBeInTheDocument();
		expect(document.querySelector("audio")).toBeNull();
	});

	test("a stop within half a second reads as nothing recorded", async () => {
		const user = userEvent.setup();
		const onqueued = vi.fn();
		render(DemoRecorder, { props: props({ onqueued }) });
		await user.click(screen.getByRole("button", { name: "Record" }));
		const stop = await screen.findByRole("button", { name: "Stop" });
		now = 200;
		await user.click(stop);
		expect(onqueued).not.toHaveBeenCalled();
		expect(status()).toBe("Nothing was recorded.");
	});

	test("a refused microphone shows the notice and goes back to idle", async () => {
		const user = userEvent.setup();
		const onphase = vi.fn();
		getUserMedia.mockRejectedValueOnce(
			Object.assign(new Error("denied"), { name: "NotAllowedError" }),
		);
		render(DemoRecorder, { props: props({ onphase }) });
		await user.click(screen.getByRole("button", { name: "Record" }));
		await screen.findByRole("status");
		expect(status()).toMatch(/^Microphone access was refused/);
		expect(onphase.mock.calls.map((c) => c[0])).toEqual(["requesting", "idle"]);
		expect(screen.getByRole("button", { name: "Record" })).toBeInTheDocument();
	});

	test("a browser without a recorder format says so without starting", async () => {
		const user = userEvent.setup();
		FakeMediaRecorder.isTypeSupported.mockImplementation(() => false);
		const onphase = vi.fn();
		render(DemoRecorder, { props: props({ onphase }) });
		await user.click(screen.getByRole("button", { name: "Record" }));
		expect(status()).toBe("This browser cannot record audio. Try Safari, Chrome or Firefox.");
		expect(onphase).not.toHaveBeenCalled();
		expect(getUserMedia).not.toHaveBeenCalled();
		FakeMediaRecorder.isTypeSupported.mockImplementation((t) => t === "audio/mp4; codecs=alac");
	});
});

describe("DemoRecorder: sources mode (the Idea Recorder)", () => {
	test("renders the six source buttons with their meters, the mix meter, and Record disabled until a source is on", () => {
		render(DemoRecorder, { props: props({ sourcesOn: allOff }) });
		const group = sources();
		for (const label of ["Microphone", "Line in", "Computer", "Piano", "Chords", "Drums"]) {
			expect(sourceButton(label)).toHaveAttribute("aria-pressed", "false");
			expect(within(group).getByRole("meter", { name: `${label} level` })).toBeInTheDocument();
		}
		// The outside sources carry a settings menu and a gain slider; the instruments a volume slider.
		for (const label of ["Microphone", "Line in", "Computer"]) {
			expect(within(group).getByRole("button", { name: `${label} settings` })).toBeInTheDocument();
			expect(within(group).getByRole("slider", { name: `${label} gain in decibels` })).toHaveValue(
				"0",
			);
		}
		expect(within(group).getByRole("slider", { name: "Piano volume in percent" })).toHaveValue(
			"80",
		);
		expect(within(group).getByRole("slider", { name: "Drums volume in percent" })).toHaveValue(
			"60",
		);
		expect(screen.getByRole("meter", { name: "Mix level" })).toBeInTheDocument();
		expect(screen.queryByRole("meter", { name: "Input level" })).toBeNull();
		const record = screen.getByRole("button", { name: "Record" });
		expect(record).toBeDisabled();
		expect(record).toHaveAttribute("title", "Switch on a source first");
	});

	test("the buttons reflect sourcesOn, and Record is enabled once any source is on", async () => {
		const { rerender } = render(DemoRecorder, { props: props({ sourcesOn: allOff }) });
		await rerender({ sourcesOn: { ...allOff, piano: true } });
		expect(sourceButton("Piano")).toHaveAttribute("aria-pressed", "true");
		expect(sourceButton("Microphone")).toHaveAttribute("aria-pressed", "false");
		expect(screen.getByRole("button", { name: "Record" })).toBeEnabled();
	});

	test("an instrument button reports the toggle to the page without touching the inputs", async () => {
		const user = userEvent.setup();
		const ontoggle = vi.fn();
		render(DemoRecorder, { props: props({ sourcesOn: allOff, ontoggle }) });
		await user.click(sourceButton("Piano"));
		expect(ontoggle).toHaveBeenCalledWith("piano", true);
		expect(fakeInputs.requestInput).not.toHaveBeenCalled();
		expect(FakeAudioContext.made).toBe(0);
	});

	test("switching the microphone in opens it in the shared inputs (one kept context); switching it out stops it", async () => {
		const user = userEvent.setup();
		const ontoggle = vi.fn();
		const { rerender } = render(DemoRecorder, { props: props({ sourcesOn: allOff, ontoggle }) });
		await user.click(sourceButton("Microphone"));
		expect(fakeInputs.requestInput).toHaveBeenCalledWith("mic");
		expect(ontoggle).toHaveBeenCalledWith("mic", true);
		expect(FakeAudioContext.made).toBe(1);
		expect(fakeInputs.attach).toHaveBeenCalledTimes(1);
		await rerender({ sourcesOn: { ...allOff, mic: true } });
		const mic = sourceButton("Microphone");
		expect(mic).toHaveAttribute("aria-pressed", "true");
		expect(mic).toHaveAttribute("title", "USB Interface: in the take (press to leave it out)");
		await user.click(mic);
		expect(fakeInputs.stop).toHaveBeenCalledWith("mic");
		expect(ontoggle).toHaveBeenLastCalledWith("mic", false);
		expect(FakeAudioContext.made).toBe(1);
	});

	test("a refused input leaves the source off and shows its error", async () => {
		const user = userEvent.setup();
		const ontoggle = vi.fn();
		fakeInputs.requestInput.mockImplementationOnce(async (s: string) => {
			fakeInputs.errors[s] = "No input was found. Plug one in or choose another in its menu.";
			return false;
		});
		render(DemoRecorder, { props: props({ sourcesOn: allOff, ontoggle }) });
		await user.click(sourceButton("Line in"));
		expect(ontoggle).not.toHaveBeenCalled();
		expect(status()).toBe("No input was found. Plug one in or choose another in its menu.");
	});

	test("the computer source goes through the share picker", async () => {
		const user = userEvent.setup();
		const ontoggle = vi.fn();
		render(DemoRecorder, { props: props({ sourcesOn: allOff, ontoggle }) });
		await user.click(sourceButton("Computer"));
		expect(fakeInputs.requestComputer).toHaveBeenCalledTimes(1);
		expect(fakeInputs.requestInput).not.toHaveBeenCalled();
		expect(ontoggle).toHaveBeenCalledWith("computer", true);
	});

	test("the first pointer-down on the device opens an input that is switched in but not yet open", async () => {
		const user = userEvent.setup();
		render(DemoRecorder, { props: props({ sourcesOn: { ...allOff, mic: true, line: true } }) });
		expect(fakeInputs.requestInput).not.toHaveBeenCalled();
		await user.click(screen.getByRole("textbox", { name: "Idea Title" }));
		expect(fakeInputs.requestInput.mock.calls.map((c) => c[0])).toEqual(["mic", "line"]);
		expect(FakeAudioContext.made).toBe(1);
		// Open now: another pointer-down opens nothing again.
		await user.click(screen.getByRole("textbox", { name: "Take label" }));
		expect(fakeInputs.requestInput).toHaveBeenCalledTimes(2);
	});

	test("a gain slider sets the input's gain in the shared inputs", async () => {
		render(DemoRecorder, { props: props({ sourcesOn: allOff }) });
		const gain = screen.getByRole("slider", { name: "Line in gain in decibels" });
		gain.focus();
		(gain as HTMLInputElement).value = "6";
		gain.dispatchEvent(new Event("input", { bubbles: true }));
		expect(fakeInputs.setInputGainDb).toHaveBeenCalledWith("line", 6);
	});

	test("Record mixes the sources that are on in the kept context and names them on the screen; the buttons are disabled meanwhile", async () => {
		const user = userEvent.setup();
		const onqueued = vi.fn();
		const pianoStream = fakeStream("piano");
		render(DemoRecorder, {
			props: props({
				sourcesOn: { ...allOff, mic: true, piano: true },
				onqueued,
				instrumentStreams: () => ({ piano: pianoStream }),
			}),
		});
		await user.click(screen.getByRole("button", { name: "Record" }));
		const stop = await screen.findByRole("button", { name: "Stop" });
		// The microphone was not open yet: Record opened it; nothing from getUserMedia here.
		expect(fakeInputs.requestInput).toHaveBeenCalledWith("mic");
		expect(getUserMedia).not.toHaveBeenCalled();
		expect(FakeAudioContext.made).toBe(1);
		expect(fakeInputs.context).toBeInstanceOf(FakeAudioContext);
		expect(screen.getByText("Input: USB Interface, Piano")).toBeInTheDocument();
		expect(screen.getByText("ALAC lossless · stereo")).toBeInTheDocument();
		expect(sourceButton("Microphone")).toBeDisabled();
		expect(sourceButton("Drums")).toBeDisabled();
		// The recorder is on the mix's stream, not a microphone's.
		expect(FakeMediaRecorder.last!.stream.getAudioTracks()[0].label).toBe("mix");
		now = 4000;
		await user.click(stop);
		expect(onqueued).toHaveBeenCalledTimes(1);
		expect(onqueued.mock.calls[0][0]).toMatchObject({ codec: "alac", durationSeconds: 4 });
		expect(sourceButton("Microphone")).toBeEnabled();
		// The kept context stays for the next take.
		expect(fakeInputs.detach).not.toHaveBeenCalled();
	});
});
