import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import type { StemEngine } from "#lib/audio/engine.svelte.js";

/**
 * The practice amp's panel on the song page: hidden until opened, and the
 * play-along transport in its header calling the SongAmp. The amp itself is
 * a stand-in; the panel is the real FloatingPanel.
 */
vi.mock("#lib/components/PracticeAmp.svelte", () => ({ default: () => {} }));
vi.mock("#lib/audio/metronome.svelte.js", () => ({ metronome: {} }));

const { default: SongAmpPanel } = await import("./SongAmpPanel.svelte");
const { SongAmp } = await import("#lib/state/songAmp.svelte.js");

function setup(engine: Partial<StemEngine> | null, open = true) {
	const amp = new SongAmp({ engine: () => engine as StemEngine | null });
	amp.open = open;
	const play = vi.spyOn(amp, "play").mockResolvedValue();
	const { container } = render(SongAmpPanel, {
		amp,
		engine: engine as StemEngine | null,
		sitePresets: null,
		account: null,
		presets: [],
		presetAdmin: false,
	});
	return { amp, play, container };
}

describe("SongAmpPanel", () => {
	test("closed, the wrapper is hidden", () => {
		const { container } = setup(null, false);
		expect((container.firstElementChild as HTMLElement).className).toContain("hidden");
	});

	test("the transport waits for a ready player", () => {
		setup(null);
		expect((screen.getByLabelText("Play the song") as HTMLButtonElement).disabled).toBe(true);
		expect(
			(screen.getByLabelText("Play the song from the top") as HTMLButtonElement).disabled,
		).toBe(true);
	});

	test("Play and From the top call the amp; Count in binds to it", async () => {
		const { amp, play } = setup({ status: "ready", playing: false });
		await fireEvent.click(screen.getByLabelText("Play the song"));
		expect(play).toHaveBeenCalledWith(false);
		await fireEvent.click(screen.getByLabelText("Play the song from the top"));
		expect(play).toHaveBeenCalledWith(true);
		const countIn = screen.getByLabelText("Count in") as HTMLInputElement;
		expect(countIn.checked).toBe(true);
		await fireEvent.click(countIn);
		expect(amp.countIn).toBe(false);
	});
});
