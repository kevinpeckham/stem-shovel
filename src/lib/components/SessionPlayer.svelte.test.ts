import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { tick } from "svelte";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { DEFAULT_PLAYBACK_EQ, type PlaybackEqSettings } from "#lib/audio/playbackEq.js";
import { playbackEqKey } from "#lib/utils/playbackEqStorage.js";
import SessionPlayer from "./SessionPlayer.svelte";

beforeAll(installFakePopover);
beforeEach(() => {
	localStorage.clear();
	// jsdom's media elements do not play.
	vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
	vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

/** A stand-in AudioContext that records the element it was handed and the nodes connected. */
function fakeAudioContext() {
	const sources: HTMLMediaElement[] = [];
	const resumed = vi.fn(() => Promise.resolve());
	const disconnected = vi.fn();
	const node = () => ({ connect: (to: unknown) => to, disconnect: disconnected });
	const glides = vi.fn();
	const param = () => ({ value: 0, setTargetAtTime: glides });
	class FakeContext {
		state = "suspended";
		currentTime = 0;
		destination = node();
		resume = resumed;
		close = () => Promise.resolve();
		createMediaElementSource(el: HTMLMediaElement) {
			sources.push(el);
			return node();
		}
		createGain() {
			return { ...node(), gain: param() };
		}
		createBiquadFilter() {
			return { ...node(), type: "", frequency: param(), gain: param(), Q: param() };
		}
	}
	return { FakeContext, sources, resumed, disconnected, glides };
}

/** Settings flat but for the given bands' gains. */
function eqWith(
	gains: Partial<Record<"low" | "lowMid" | "mid" | "highMid" | "high", number>>,
	highPass = false,
) {
	const s: PlaybackEqSettings = structuredClone(DEFAULT_PLAYBACK_EQ) as PlaybackEqSettings;
	s.highPass = highPass;
	for (const [band, gain] of Object.entries(gains)) s[band as keyof typeof gains].gain = gain;
	return s;
}
const queue = [
	{
		id: "r1",
		title: "Take one",
		url: "https://blob.example/r1.mp3",
		session: "Monday",
		sessionId: "s1",
		sessionEq: null,
	},
];
const stored = (sessionId = "s1") =>
	JSON.parse(localStorage.getItem(playbackEqKey(sessionId)) ?? "null");
const store = (sessionId: string, settings: PlaybackEqSettings) =>
	localStorage.setItem(playbackEqKey(sessionId), JSON.stringify(settings));

describe("SessionPlayer EQ", () => {
	test("the EQ button renders unlit and opens the panel", async () => {
		const user = userEvent.setup();
		render(SessionPlayer, { props: { queue } });
		const button = screen.getByRole("button", { name: "EQ" });
		expect(button).toHaveAttribute("data-active", "false");
		await user.click(button);
		expect(screen.getByRole("slider", { name: "Low gain" })).toBeVisible();
	});

	test("a change in the panel is saved and lights the button; Reset returns to flat", async () => {
		const user = userEvent.setup();
		render(SessionPlayer, { props: { queue, current: "r1" } });
		const button = screen.getByRole("button", { name: "EQ" });
		await user.click(button);
		await fireEvent.input(screen.getByRole("slider", { name: "Mid gain" }), {
			target: { value: "-6" },
		});
		expect(stored()).toEqual(eqWith({ mid: -6 }));
		expect(button).toHaveAttribute("data-active", "true");
		expect(screen.getByTestId("eq-status")).toHaveTextContent("Your EQ for this session");
		await user.click(screen.getByRole("button", { name: "Reset" }));
		expect(stored()).toBeNull();
		expect(button).toHaveAttribute("data-active", "false");
		expect(screen.getByTestId("eq-status")).toHaveTextContent("Flat");
	});

	test("loads the device's settings after mount", async () => {
		store("s1", eqWith({ low: 2 }, true));
		render(SessionPlayer, { props: { queue, current: "r1" } });
		await tick();
		expect(screen.getByRole("button", { name: "EQ" })).toHaveAttribute("data-active", "true");
	});

	test("plays without Web Audio (jsdom has no AudioContext): the element stays plain", async () => {
		const user = userEvent.setup();
		const { container } = render(SessionPlayer, { props: { queue, current: "r1" } });
		const audio = container.querySelector("audio")!;
		expect(audio).toHaveAttribute("crossorigin", "anonymous");
		await user.click(screen.getByRole("button", { name: "Play" }));
		expect(container.querySelector("audio")).toBe(audio);
	});

	test("the first play makes and resumes a context and routes the element through the EQ", async () => {
		const user = userEvent.setup();
		const fake = fakeAudioContext();
		vi.stubGlobal("AudioContext", fake.FakeContext);
		const { container } = render(SessionPlayer, { props: { queue, current: "r1" } });
		const audio = container.querySelector("audio")!;
		expect(fake.sources).toEqual([]);
		await user.click(screen.getByRole("button", { name: "Play" }));
		expect(fake.resumed).toHaveBeenCalled();
		expect(fake.sources).toEqual([audio]);
		// One source per element: a second play does not ask again.
		await user.click(screen.getByRole("button", { name: /Play|Pause/ }));
		expect(fake.sources).toHaveLength(1);
	});

	test("moving a slider while wired glides the graph and never rebuilds it (Kevin, 2026-10-26: the sound stopped for good)", async () => {
		const user = userEvent.setup();
		const fake = fakeAudioContext();
		vi.stubGlobal("AudioContext", fake.FakeContext);
		// Kevin's flow: nothing current, a row's play makes the context first and the element mounts after it.
		const { component } = render(SessionPlayer, { props: { queue } });
		await component.play("r1");
		await tick();
		expect(fake.sources).toHaveLength(1);
		fake.disconnected.mockClear();
		await user.click(screen.getByRole("button", { name: "EQ" }));
		const low = screen.getByRole("slider", { name: "Low gain" }) as HTMLInputElement;
		low.value = "4";
		low.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(screen.getByRole("button", { name: "EQ" })).toHaveAttribute("data-active", "true");
		// The settings reached the live graph through setEq, not through a rebuilt attachment.
		expect(fake.glides).toHaveBeenCalledWith(4, 0, expect.any(Number));
		expect(fake.sources).toHaveLength(1);
		expect(fake.disconnected).not.toHaveBeenCalled();
	});

	test("a track of another session plays with that session's EQ, and a change stays with its session", async () => {
		const two = [
			...queue,
			{ ...queue[0], id: "r2", title: "Take two", session: "Tuesday", sessionId: "s2" },
		];
		store("s2", eqWith({ high: 5 }));
		const { component } = render(SessionPlayer, { props: { queue: two, current: "r1" } });
		await tick();
		const button = screen.getByRole("button", { name: "EQ" });
		expect(button).toHaveAttribute("data-active", "false");
		await component.play("r2");
		await tick();
		expect(button).toHaveAttribute("data-active", "true");
		expect(screen.getByTestId("eq-high-value")).toHaveTextContent("+5 dB");
		await component.play("r1");
		await tick();
		expect(button).toHaveAttribute("data-active", "false");
		expect(stored("s1")).toBeNull();
	});

	test("the device's EQ beats the session's shared one, which beats flat", async () => {
		const shared = eqWith({ lowMid: -3 });
		const tracks = [
			{ ...queue[0], sessionEq: shared },
			{ ...queue[0], id: "r2", sessionId: "s2", sessionEq: shared },
			{ ...queue[0], id: "r3", sessionId: "s3", sessionEq: null },
		];
		store("s1", eqWith({ mid: 4 }));
		const { component } = render(SessionPlayer, { props: { queue: tracks, current: "r1" } });
		await tick();
		expect(screen.getByTestId("eq-mid-value")).toHaveTextContent("+4 dB");
		expect(screen.getByTestId("eq-lowMid-value")).toHaveTextContent("0 dB");
		expect(screen.getByTestId("eq-status")).toHaveTextContent("Your EQ for this session");
		await component.play("r2");
		await tick();
		expect(screen.getByTestId("eq-lowMid-value")).toHaveTextContent("−3 dB");
		expect(screen.getByTestId("eq-status")).toHaveTextContent("The session's shared EQ");
		await component.play("r3");
		await tick();
		expect(screen.getByTestId("eq-lowMid-value")).toHaveTextContent("0 dB");
		expect(screen.getByTestId("eq-status")).toHaveTextContent("Flat");
	});

	test("Reset forgets the device's EQ and falls back to the shared one", async () => {
		const user = userEvent.setup();
		store("s1", eqWith({ mid: 4 }));
		render(SessionPlayer, {
			props: { queue: [{ ...queue[0], sessionEq: eqWith({ low: -2 }) }], current: "r1" },
		});
		await tick();
		await user.click(screen.getByRole("button", { name: "EQ" }));
		await user.click(screen.getByRole("button", { name: "Reset" }));
		expect(stored()).toBeNull();
		expect(screen.getByTestId("eq-low-value")).toHaveTextContent("−2 dB");
		expect(screen.getByTestId("eq-mid-value")).toHaveTextContent("0 dB");
		expect(screen.getByTestId("eq-status")).toHaveTextContent("The session's shared EQ");
	});

	test("Save for everyone hands the session's EQ to the page and clears the device's", async () => {
		const user = userEvent.setup();
		const mine = eqWith({ highMid: 3 });
		store("s1", mine);
		const onsaveshared = vi.fn(async (_id: string, eq: PlaybackEqSettings | null) => eq);
		render(SessionPlayer, { props: { queue, current: "r1", canEdit: true, onsaveshared } });
		await tick();
		await user.click(screen.getByRole("button", { name: "EQ" }));
		const save = screen.getByRole("button", { name: "Save for everyone" });
		await user.click(save);
		expect(onsaveshared).toHaveBeenCalledWith("s1", mine);
		expect(stored()).toBeNull();
		expect(screen.getByTestId("eq-status")).toHaveTextContent("The session's shared EQ");
		expect(screen.getByTestId("eq-highMid-value")).toHaveTextContent("+3 dB");
		// The EQ is the shared one now: nothing more to save, and it can be removed.
		expect(save).toBeDisabled();
		await user.click(screen.getByRole("button", { name: "Remove shared EQ" }));
		expect(onsaveshared).toHaveBeenLastCalledWith("s1", null);
		expect(screen.getByTestId("eq-status")).toHaveTextContent("Flat");
	});

	test("Save for everyone is a member's only", async () => {
		const user = userEvent.setup();
		render(SessionPlayer, { props: { queue, current: "r1", onsaveshared: vi.fn() } });
		await user.click(screen.getByRole("button", { name: "EQ" }));
		expect(screen.queryByRole("button", { name: "Save for everyone" })).toBeNull();
	});
});
