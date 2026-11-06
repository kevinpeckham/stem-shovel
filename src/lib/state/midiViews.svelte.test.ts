import { afterEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The song page's MIDI views over stand-ins: the fetch is recorded and the
 * parser returns a marker of the bytes it was given.
 */
const parseMidi = vi.hoisted(() => vi.fn((buf: ArrayBuffer) => ({ bytes: buf.byteLength })));
vi.mock("#lib/audio/midi.js", () => ({ parseMidi }));
const { MidiViews } = await import("./midiViews.svelte.js");

function ok(bytes = 4) {
	return { ok: true, arrayBuffer: async () => new ArrayBuffer(bytes) } as Response;
}

describe("MidiViews", () => {
	afterEach(() => vi.unstubAllGlobals());

	test("toggles a stem's view on and off, fetching each file once", async () => {
		const fetch = vi.fn(async () => ok());
		const midi = new MidiViews({ fetch });
		await midi.toggle("s1", "https://blob/a.mid");
		expect(midi.views.s1).toEqual({ bytes: 4 });
		await midi.toggle("s1", "https://blob/a.mid");
		expect(midi.views.s1).toBeUndefined();
		await midi.toggle("s1", "https://blob/a.mid");
		expect(midi.views.s1).toEqual({ bytes: 4 });
		await midi.toggle("s2", "https://blob/a.mid");
		expect(fetch).toHaveBeenCalledOnce();
		expect(Object.keys(midi.views)).toEqual(["s1", "s2"]);
	});

	test("a stem without a file does nothing", async () => {
		const fetch = vi.fn(async () => ok());
		const midi = new MidiViews({ fetch });
		await midi.toggle("s1", undefined);
		expect(fetch).not.toHaveBeenCalled();
		expect(midi.views).toEqual({});
	});

	test("a failed read alerts and is forgotten, so the next toggle fetches again", async () => {
		const alert = vi.fn();
		vi.stubGlobal("alert", alert);
		const fetch = vi
			.fn()
			.mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found" })
			.mockResolvedValueOnce(ok(8));
		const midi = new MidiViews({ fetch });
		await midi.toggle("s1", "https://blob/a.mid");
		expect(alert).toHaveBeenCalledWith("Could not read the MIDI file: 404 Not Found");
		expect(midi.views).toEqual({});
		await midi.toggle("s1", "https://blob/a.mid");
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(midi.views.s1).toEqual({ bytes: 8 });
	});
});
