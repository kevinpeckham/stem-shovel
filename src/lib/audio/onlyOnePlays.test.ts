import { describe, expect, test, vi } from "vite-plus/test";
import { claimPlayback, releasePlayback } from "./onlyOnePlays";

describe("onlyOnePlays", () => {
	test("a transport that claims playback stops the one that held it, and only that one", () => {
		const player = { stop: vi.fn() };
		const drums = { stop: vi.fn() };
		claimPlayback(player);
		claimPlayback(drums);
		expect(player.stop).toHaveBeenCalledTimes(1);
		expect(drums.stop).not.toHaveBeenCalled();
		// Claiming again is not a stop.
		claimPlayback(drums);
		expect(drums.stop).not.toHaveBeenCalled();
	});
	test("a transport that let go is not stopped by the next one", () => {
		const player = { stop: vi.fn() };
		const drums = { stop: vi.fn() };
		claimPlayback(player);
		releasePlayback(player);
		claimPlayback(drums);
		expect(player.stop).not.toHaveBeenCalled();
		// Letting go of what one never held changes nothing.
		releasePlayback(player);
		claimPlayback(player);
		expect(drums.stop).toHaveBeenCalledTimes(1);
	});
});
