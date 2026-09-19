import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { playThroughSilentSwitch, resetPlayThroughSilentSwitch } from "./playThroughSilentSwitch";

const iPhone = (extra: Record<string, unknown> = {}) => {
	Object.defineProperty(globalThis, "navigator", {
		value: { platform: "iPhone", maxTouchPoints: 5, ...extra },
		configurable: true,
	});
};

describe("playThroughSilentSwitch", () => {
	afterEach(() => {
		resetPlayThroughSilentSwitch();
		vi.restoreAllMocks();
	});

	test("prefers the AudioSession API when the browser has it, and sets it every time", () => {
		const audioSession = { type: "auto" };
		iPhone({ audioSession });
		playThroughSilentSwitch();
		expect(audioSession.type).toBe("playback");
		expect(document.querySelector("audio")).toBeNull();
		audioSession.type = "play-and-record"; // the recorder took the microphone in between
		playThroughSilentSwitch();
		expect(audioSession.type).toBe("playback");
	});

	test("falls back to a silent looping audio element, once", async () => {
		iPhone();
		const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
		playThroughSilentSwitch();
		playThroughSilentSwitch();
		const els = document.querySelectorAll("audio");
		expect(els.length).toBe(1);
		expect(els[0].loop).toBe(true);
		expect(els[0].src.startsWith("data:audio/wav")).toBe(true);
		expect(play).toHaveBeenCalledTimes(1);
	});

	test("a refused play (no gesture) leaves it to the next call", async () => {
		iPhone();
		vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("NotAllowedError"));
		playThroughSilentSwitch();
		await new Promise((r) => setTimeout(r, 0));
		expect(document.querySelector("audio")).toBeNull();
		vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
		playThroughSilentSwitch();
		expect(document.querySelectorAll("audio").length).toBe(1);
	});

	test("does nothing off iOS", () => {
		Object.defineProperty(globalThis, "navigator", {
			value: { platform: "MacIntel", maxTouchPoints: 0, audioSession: { type: "auto" } },
			configurable: true,
		});
		playThroughSilentSwitch();
		expect(document.querySelector("audio")).toBeNull();
	});
});
