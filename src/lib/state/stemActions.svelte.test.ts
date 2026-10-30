import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The song page's per-stem actions over stand-ins: the remote commands, the
 * uploads and the notices are recorded calls; AudioContext is a stub.
 */
const remote = vi.hoisted(() => ({
	renameStem: vi.fn(async (_args: unknown) => {}),
	reorderStems: vi.fn(async (_args: unknown) => {}),
	setSongVersion: vi.fn(async (_args: unknown) => {}),
	setStemTint: vi.fn(async (_args: unknown) => {}),
}));
vi.mock("#lib/remote/songs.remote.js", () => remote);
const upload = vi.hoisted(() => ({
	postJson: vi.fn(async (_url: string, _body: unknown) => ({})),
	uploadStemFile: vi.fn(
		async (
			_file: File,
			reserve: () => Promise<unknown>,
			opts: { onProgress?: (p: number) => void; onDecoding?: () => void },
		) => {
			await reserve();
			opts.onProgress?.(50);
			opts.onDecoding?.();
		},
	),
	uploadMidiFile: vi.fn(
		async (_stemId: string, _file: File, onProgress: (percent: number) => void) => {
			onProgress(60);
		},
	),
}));
vi.mock("#lib/upload.js", () => upload);
const notify = vi.hoisted(() => vi.fn());
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify }));

const { StemActions } = await import("./stemActions.svelte.js");
const { MIDI_MAX_BYTES } = await import("#lib/constants/midiFormats.js");

const close = vi.fn(async () => {});
class FakeAudioContext {
	close = close;
}

/** A file input stand-in holding the picked file. */
function input(f?: File) {
	return { files: f ? [f] : [], value: "picked" } as unknown as HTMLInputElement;
}
function file(name: string, size = 10) {
	const f = new File(["x"], name);
	Object.defineProperty(f, "size", { value: size });
	return f;
}
function setup() {
	const onsaved = vi.fn(async () => {});
	const actions = new StemActions({ song: () => ({ id: "song1", version: "1.2.3" }), onsaved });
	return { actions, onsaved };
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("AudioContext", FakeAudioContext);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

describe("StemActions", () => {
	test("replace uploads through the stem's replace reservation, then refreshes and offers a bump", async () => {
		const { actions, onsaved } = setup();
		const el = input(file("bass.wav", 99));
		await actions.replace("s1", el);
		expect(el.value).toBe("");
		expect(upload.postJson).toHaveBeenCalledWith("/api/stems/s1/replace", {
			filename: "bass.wav",
			sizeBytes: 99,
		});
		expect(actions.replacing.s1).toBeUndefined();
		expect(onsaved).toHaveBeenCalledOnce();
		expect(actions.versionOffer).toBe(true);
		expect(close).toHaveBeenCalledOnce();
	});

	test("replace tracks the upload's percent and stage while it runs", async () => {
		const { actions } = setup();
		const seen: unknown[] = [];
		upload.uploadStemFile.mockImplementationOnce(async (_f, _reserve, opts) => {
			seen.push({ ...actions.replacing.s1 });
			opts.onProgress?.(40);
			seen.push({ ...actions.replacing.s1 });
			opts.onDecoding?.();
			seen.push({ ...actions.replacing.s1 });
		});
		await actions.replace("s1", input(file("bass.wav")));
		expect(seen).toEqual([
			{ percent: 0, stage: "uploading" },
			{ percent: 40, stage: "uploading" },
			{ percent: 40, stage: "decoding" },
		]);
	});

	test("a failed replace keeps the row's error and offers nothing", async () => {
		const { actions, onsaved } = setup();
		upload.uploadStemFile.mockRejectedValueOnce(new Error("Unsupported audio"));
		await actions.replace("s1", input(file("bass.txt")));
		expect(actions.replacing.s1).toEqual({
			percent: 0,
			stage: "error",
			error: "Unsupported audio",
		});
		expect(onsaved).not.toHaveBeenCalled();
		expect(actions.versionOffer).toBe(false);
		expect(close).toHaveBeenCalledOnce();
	});

	test("replace with nothing picked does nothing", async () => {
		const { actions } = setup();
		await actions.replace("s1", input());
		expect(upload.uploadStemFile).not.toHaveBeenCalled();
	});

	test("tint saves the tint and refreshes; a failure notifies", async () => {
		const { actions, onsaved } = setup();
		await actions.tint("s1", "sea");
		expect(remote.setStemTint).toHaveBeenCalledWith({ id: "s1", tint: "sea" });
		expect(onsaved).toHaveBeenCalledOnce();
		remote.setStemTint.mockRejectedValueOnce(new Error("Not allowed"));
		await actions.tint("s1", null);
		expect(notify).toHaveBeenCalledWith("Could not set the tint: Not allowed", { kind: "error" });
	});

	test("rename saves a new trimmed label and refreshes; the same or an empty one is skipped", async () => {
		const { actions, onsaved } = setup();
		vi.stubGlobal(
			"prompt",
			vi.fn(() => "  Bass DI  "),
		);
		await actions.rename("s1", "Bass");
		expect(prompt).toHaveBeenCalledWith("Stem name", "Bass");
		expect(remote.renameStem).toHaveBeenCalledWith({ id: "s1", label: "Bass DI" });
		expect(onsaved).toHaveBeenCalledOnce();
		vi.stubGlobal(
			"prompt",
			vi.fn(() => "Bass"),
		);
		await actions.rename("s1", "Bass");
		vi.stubGlobal(
			"prompt",
			vi.fn(() => null),
		);
		await actions.rename("s1", "Bass");
		expect(remote.renameStem).toHaveBeenCalledOnce();
	});

	test("uploadMidi refuses a file that is not MIDI", async () => {
		const { actions } = setup();
		await actions.uploadMidi("s1", input(file("bass.wav")));
		expect(actions.midiJobs.s1).toEqual({
			percent: 0,
			error: "bass.wav is not a MIDI file (.mid or .midi).",
		});
		expect(upload.uploadMidiFile).not.toHaveBeenCalled();
	});

	test("uploadMidi refuses a file over the limit", async () => {
		const { actions } = setup();
		await actions.uploadMidi("s1", input(file("bass.mid", MIDI_MAX_BYTES + 1)));
		expect(actions.midiJobs.s1?.error).toMatch(/^bass\.mid is over .+\.$/);
		expect(upload.uploadMidiFile).not.toHaveBeenCalled();
	});

	test("uploadMidi uploads, refreshes and clears the job; a failure keeps its message", async () => {
		const { actions, onsaved } = setup();
		const f = file("bass.mid");
		await actions.uploadMidi("s1", input(f));
		expect(upload.uploadMidiFile).toHaveBeenCalledWith("s1", f, expect.any(Function));
		expect(onsaved).toHaveBeenCalledOnce();
		expect(actions.midiJobs).toEqual({});
		upload.uploadMidiFile.mockRejectedValueOnce(new Error("Blob refused"));
		await actions.uploadMidi("s1", input(f));
		expect(actions.midiJobs.s1).toEqual({ percent: 0, error: "Blob refused" });
	});

	test("saveOrder saves the order, refreshes and notifies; a failure notifies the error", async () => {
		const { actions, onsaved } = setup();
		await actions.saveOrder(["b", "a"]);
		expect(remote.reorderStems).toHaveBeenCalledWith({ songId: "song1", ids: ["b", "a"] });
		expect(onsaved).toHaveBeenCalledOnce();
		expect(notify).toHaveBeenCalledWith("Stem order saved");
		remote.reorderStems.mockRejectedValueOnce(new Error("Not a member"));
		await actions.saveOrder(["a", "b"]);
		expect(notify).toHaveBeenLastCalledWith("Could not save the stem order: Not a member", {
			kind: "error",
		});
	});

	test("offer and dismiss show and hide the version offer", () => {
		const { actions } = setup();
		actions.offer();
		expect(actions.versionOffer).toBe(true);
		actions.dismiss();
		expect(actions.versionOffer).toBe(false);
	});

	test("bump sends the next version at the level, refreshes, notifies and clears the offer", async () => {
		const { actions, onsaved } = setup();
		actions.offer();
		remote.setSongVersion.mockImplementationOnce(async () => {
			expect(actions.versionBusy).toBe(true);
		});
		await actions.bump("minor");
		expect(remote.setSongVersion).toHaveBeenCalledWith({ id: "song1", version: "1.3.0" });
		expect(onsaved).toHaveBeenCalledOnce();
		expect(notify).toHaveBeenCalledWith("Version bumped to v1.3.0");
		expect(actions.versionOffer).toBe(false);
		expect(actions.versionBusy).toBe(false);
	});

	test("a failed bump still clears the offer and the busy flag", async () => {
		const { actions } = setup();
		actions.offer();
		remote.setSongVersion.mockRejectedValueOnce(new Error("Conflict"));
		await expect(actions.bump("patch")).rejects.toThrow("Conflict");
		expect(actions.versionOffer).toBe(false);
		expect(actions.versionBusy).toBe(false);
	});
});
