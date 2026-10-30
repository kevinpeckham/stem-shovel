import { tick } from "svelte";
import { fakeAudioBuffer } from "../../../tests/helpers/fakeAudioBuffer";
import type { StemEngine } from "#lib/audio/engine.svelte.js";
import type { StemManifest } from "#lib/audio/types.js";
import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import StemPlayer from "./StemPlayer.svelte";

/**
 * The kept-songs cache (audio/mediaCache.ts) is a stand-in, off unless a
 * test turns it on (OPFS needs a browser); the engine shares it, so a kept
 * song's load reads from it. Notifications are recorded, not shown.
 */
const cache = vi.hoisted(() => ({
	available: false,
	read: vi.fn(async () => null),
	stat: vi.fn(async () => null),
	write: vi.fn(async () => true),
	songs: vi.fn<(timeoutMs?: number) => Promise<{ song: string; bytes: number; keys: string[] }[]>>(
		async () => [],
	),
	prune: vi.fn(async () => {}),
	forgetSong: vi.fn(async () => {}),
}));
vi.mock("#lib/audio/mediaCache.js", () => ({ mediaCache: cache }));
const notify = vi.hoisted(() => vi.fn());
vi.mock("#lib/state/notifications.svelte.js", async (importOriginal) => ({
	...(await importOriginal<object>()),
	notify,
}));

/**
 * The real StemEngine runs here, on a stand-in AudioContext: decoding hands
 * back a short silent buffer, gain nodes are inert objects, and fetch answers
 * every stem URL with a few bytes. That covers loading, the rows, relabel and
 * reorder; playback itself (sources, the clock, the animation frame) needs
 * real Web Audio and is left to the browser (docs/testing.md).
 */
function fakeGain() {
	return {
		connect() {},
		disconnect() {},
		gain: { value: 1, cancelScheduledValues() {}, setTargetAtTime() {} },
	};
}
class FakeAudioContext {
	state = "running";
	currentTime = 0;
	destination = {};
	createGain = fakeGain;
	/** The pan after each stem's gain: a StereoPannerNode for stereo, a pair of gains into a merger for mono. */
	createStereoPanner = () => ({
		connect() {},
		disconnect() {},
		pan: { value: 0, cancelScheduledValues() {}, setTargetAtTime() {} },
	});
	createChannelMerger = () => ({ connect() {}, disconnect() {} });
	/** The output meter the engine makes with its master (engine.meter()). */
	createAnalyser = () => ({
		fftSize: 2048,
		connect() {},
		disconnect() {},
		getFloatTimeDomainData() {},
	});
	createBuffer(n: number, length: number, sampleRate: number) {
		return fakeAudioBuffer(
			Array.from({ length: n }, () => new Float32Array(length)),
			sampleRate,
		);
	}
	decodeAudioData = vi.fn(async () => fakeAudioBuffer([new Float32Array(3200)]));
	resume = async () => {};
	close = async () => {};
}
const fetchSpy = vi.fn(async () => ({
	ok: true,
	status: 200,
	statusText: "OK",
	arrayBuffer: async () => new ArrayBuffer(8),
}));

beforeAll(() => {
	vi.stubGlobal("AudioContext", FakeAudioContext);
	vi.stubGlobal("fetch", fetchSpy);
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => fetchSpy.mockClear());

const manifest = (): StemManifest => ({
	title: "Song",
	stems: [
		{ id: "drums", label: "Drums", url: "https://blob/drums.m4a", duration: 10, peaks: [0.5] },
		{ id: "bass", label: "Bass", url: "https://blob/bass.m4a", duration: 10, peaks: [0.5] },
		{ id: "vox", label: "Vox", url: "https://blob/vox.m4a", duration: 10, peaks: [0.5] },
	],
});
const rowNames = () =>
	[...document.querySelectorAll("[data-stem-row]")].map((r) => r.getAttribute("aria-label"));
const ready = () =>
	waitFor(() => expect(screen.getByRole("button", { name: "Play" })).toBeEnabled());

describe("StemPlayer", () => {
	test("renders a row per manifest stem, hands the engine over once, and decodes to ready", async () => {
		const onengine = vi.fn<(engine: StemEngine) => void>();
		render(StemPlayer, { props: { manifest: manifest(), onengine } });
		expect(onengine).toHaveBeenCalledTimes(1);
		const engine = onengine.mock.calls[0][0];
		expect(rowNames()).toEqual(["Drums", "Bass", "Vox"]);
		expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
		expect(screen.getByText(/Decoding stem 1 of 3/)).toBeInTheDocument();
		await ready();
		expect(fetchSpy).toHaveBeenCalledTimes(3);
		expect(engine.status).toBe("ready");
		expect(screen.getByText(/3 stems/)).toHaveTextContent("decoded in memory");
		expect(onengine).toHaveBeenCalledTimes(1);
	});

	test("without onreorder there are no grips; with it, the arrow keys move a row and report the order", async () => {
		const user = userEvent.setup();
		const { unmount } = render(StemPlayer, { props: { manifest: manifest() } });
		await ready();
		expect(screen.queryByRole("button", { name: /^Move / })).toBeNull();
		unmount();
		const onreorder = vi.fn();
		render(StemPlayer, { props: { manifest: manifest(), onreorder } });
		await ready();
		const grip = screen.getByRole("button", { name: "Move Drums" });
		grip.focus();
		await user.keyboard("{ArrowDown}");
		expect(onreorder).toHaveBeenLastCalledWith(["bass", "drums", "vox"]);
		expect(rowNames()).toEqual(["Bass", "Drums", "Vox"]);
		// Moving the row in the keyed each re-inserts its element, which would drop focus to the body;
		// the grip takes it back after the tick, so the next press moves the row again.
		await tick();
		expect(grip.isConnected).toBe(true);
		expect(document.activeElement).toBe(grip);
		await user.keyboard("{ArrowDown}");
		expect(onreorder).toHaveBeenLastCalledWith(["bass", "vox", "drums"]);
		await tick();
		// Already last: nothing moves, nothing reported.
		await user.keyboard("{ArrowDown}");
		expect(onreorder).toHaveBeenCalledTimes(2);
		screen.getByRole("button", { name: "Move Bass" }).focus();
		await user.keyboard("{ArrowUp}");
		expect(onreorder).toHaveBeenCalledTimes(2);
		expect(rowNames()).toEqual(["Bass", "Vox", "Drums"]);
	});

	test("a refreshed manifest with the same stems relabels and reorders without decoding again", async () => {
		const { rerender } = render(StemPlayer, { props: { manifest: manifest() } });
		await ready();
		expect(fetchSpy).toHaveBeenCalledTimes(3);
		const next = manifest();
		next.stems = [next.stems[2], next.stems[0]];
		next.stems[1].label = "Kit";
		await rerender({ manifest: next });
		expect(rowNames()).toEqual(["Vox", "Kit"]);
		expect(fetchSpy).toHaveBeenCalledTimes(3);
		expect(screen.getByText(/2 stems/)).toBeInTheDocument();
	});

	test("a failed fetch shows the error with the hint", async () => {
		fetchSpy.mockResolvedValueOnce({
			ok: false,
			status: 404,
			statusText: "Not Found",
			arrayBuffer: async () => new ArrayBuffer(0),
		});
		render(StemPlayer, { props: { manifest: manifest() } });
		await screen.findByText("Couldn't load the stems.");
		expect(screen.getByText(/404 Not Found/)).toBeInTheDocument();
	});

	describe("keep on this device", () => {
		const MB = 1024 * 1024;
		const keys = ["drums", "bass", "vox"];
		beforeEach(() => {
			cache.available = true;
			cache.songs.mockReset();
			cache.songs.mockImplementation(async () => []);
			cache.forgetSong.mockClear();
			notify.mockClear();
		});
		afterAll(() => {
			cache.available = false;
		});

		test("no link without a song id, or without a cache", async () => {
			const { unmount } = render(StemPlayer, { props: { manifest: manifest() } });
			await ready();
			expect(screen.queryByRole("button", { name: "keep on this device" })).toBeNull();
			unmount();
			cache.available = false;
			render(StemPlayer, { props: { manifest: manifest(), songId: "song1" } });
			await ready();
			expect(screen.queryByRole("button", { name: "keep on this device" })).toBeNull();
			expect(cache.songs).not.toHaveBeenCalled();
		});

		test("asks the cache (1 s at most) before the first load; keeping fetches, notifies and offers remove", async () => {
			const user = userEvent.setup();
			const onengine = vi.fn<(engine: StemEngine) => void>();
			render(StemPlayer, { props: { manifest: manifest(), songId: "song1", onengine } });
			const engine = onengine.mock.calls[0][0];
			await ready();
			expect(cache.songs).toHaveBeenNthCalledWith(1, 1000);
			expect(engine.keepSong).toBeNull();
			const keep = screen.getByRole("button", { name: "keep on this device" });
			expect(keep).toHaveClass("link");
			expect(keep.title).toMatch(/The page itself still needs a connection/);
			fetchSpy.mockClear();
			cache.songs.mockImplementation(async () => [{ song: "song1", bytes: 42 * MB, keys }]);
			const keepSpy = vi.spyOn(engine, "keepOnDevice");
			await user.click(keep);
			expect(keepSpy).toHaveBeenCalledWith("song1");
			await waitFor(() => expect(notify).toHaveBeenCalledWith("Kept on this device (42.0 MB)"));
			expect(await screen.findByText(/kept on this device \(42\.0 MB\)/)).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "remove" })).toHaveAttribute(
				"title",
				"Remove this song's playback files from this device",
			);
		});

		test("a kept song loads with keepSong set; remove forgets it and notifies", async () => {
			const user = userEvent.setup();
			const onengine = vi.fn<(engine: StemEngine) => void>();
			cache.songs.mockImplementation(async () => [{ song: "song1", bytes: 42 * MB, keys }]);
			render(StemPlayer, { props: { manifest: manifest(), songId: "song1", onengine } });
			const engine = onengine.mock.calls[0][0];
			await ready();
			expect(engine.keepSong).toBe("song1");
			await user.click(await screen.findByRole("button", { name: "remove" }));
			expect(cache.forgetSong).toHaveBeenCalledWith("song1");
			expect(notify).toHaveBeenCalledWith("Removed from this device");
			expect(engine.keepSong).toBeNull();
		});

		test("an incomplete copy says how many stems are missing and offers update", async () => {
			const user = userEvent.setup();
			const onengine = vi.fn<(engine: StemEngine) => void>();
			cache.songs.mockImplementation(async () => [
				{ song: "song1", bytes: 42 * MB, keys: ["drums", "bass"] },
			]);
			render(StemPlayer, { props: { manifest: manifest(), songId: "song1", onengine } });
			const engine = onengine.mock.calls[0][0];
			await ready();
			expect(
				await screen.findByText(/kept on this device \(42\.0 MB, 1 stem missing\)/),
			).toBeInTheDocument();
			const keepSpy = vi.spyOn(engine, "keepOnDevice").mockRejectedValue(new Error("No room"));
			await user.click(screen.getByRole("button", { name: "update" }));
			expect(keepSpy).toHaveBeenCalledWith("song1");
			await waitFor(() => expect(notify).toHaveBeenCalledWith("No room", { kind: "error" }));
		});
	});
});
