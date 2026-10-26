import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { tick } from "svelte";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { PLAYBACK_EQ_KEY } from "#lib/utils/playbackEqStorage.js";
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

const queue = [
	{ id: "r1", title: "Take one", url: "https://blob.example/r1.mp3", session: "Monday" },
];
const stored = () => JSON.parse(localStorage.getItem(PLAYBACK_EQ_KEY) ?? "null");

describe("SessionPlayer EQ", () => {
	test("the EQ button renders unlit and opens the panel", async () => {
		const user = userEvent.setup();
		render(SessionPlayer, { props: { queue } });
		const button = screen.getByRole("button", { name: "EQ" });
		expect(button).toHaveAttribute("data-active", "false");
		await user.click(button);
		expect(screen.getByRole("slider", { name: /Low/ })).toBeVisible();
	});

	test("a change in the panel is saved and lights the button; Reset returns to flat", async () => {
		const user = userEvent.setup();
		render(SessionPlayer, { props: { queue } });
		const button = screen.getByRole("button", { name: "EQ" });
		await user.click(button);
		await fireEvent.input(screen.getByRole("slider", { name: /Mid/ }), { target: { value: "-6" } });
		expect(stored()).toEqual({ highPass: false, low: 0, mid: -6, high: 0 });
		expect(button).toHaveAttribute("data-active", "true");
		await user.click(screen.getByRole("button", { name: "Reset" }));
		expect(stored()).toEqual({ highPass: false, low: 0, mid: 0, high: 0 });
		expect(button).toHaveAttribute("data-active", "false");
	});

	test("loads the device's settings after mount", async () => {
		localStorage.setItem(
			PLAYBACK_EQ_KEY,
			JSON.stringify({ highPass: true, low: 2, mid: 0, high: 0 }),
		);
		render(SessionPlayer, { props: { queue } });
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
		const low = screen.getByRole("slider", { name: /Low/ }) as HTMLInputElement;
		low.value = "4";
		low.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(screen.getByRole("button", { name: "EQ" })).toHaveAttribute("data-active", "true");
		// The settings reached the live graph through setEq, not through a rebuilt attachment.
		expect(fake.glides).toHaveBeenCalledWith(4, 0, expect.any(Number));
		expect(fake.sources).toHaveLength(1);
		expect(fake.disconnected).not.toHaveBeenCalled();
	});
});
