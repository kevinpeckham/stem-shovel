import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

/** Mix uploads with the calls recorded: each file reports progress, or fails when named so. */
const uploadMixFile = vi.hoisted(() =>
	vi.fn(
		async (
			file: File,
			reserve: () => Promise<unknown>,
			opts: { onProgress?: (percent: number) => void; onDecoding?: () => void },
		) => {
			await reserve();
			if (file.name.startsWith("bad")) throw new Error("Upload refused");
			opts.onProgress?.(100);
			opts.onDecoding?.();
			return { mixId: `mix-${file.name}`, version: 1 };
		},
	),
);
const postJson = vi.hoisted(() => vi.fn(async () => ({ mixId: "m", pathname: "p", version: 1 })));
vi.mock("#lib/upload.js", () => ({ uploadMixFile, postJson }));
const notify = vi.hoisted(() => vi.fn());
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify }));
vi.stubGlobal("AudioContext", class {});

const { MixUploads } = await import("./mixUploads.svelte.js");
const { MAX_MIXES_PER_SONG } = await import("#lib/constants/mixFormats.js");
const { STEM_MAX_BYTES } = await import("#lib/constants/stemFormats.js");

function file(name: string, size = 10) {
	const f = new File(["x"], name);
	Object.defineProperty(f, "size", { value: size });
	return f;
}
function setup(mixCount = 0) {
	const onuploaded = vi.fn(async () => {});
	const open = vi.fn(async (_id: string) => {});
	const showMixes = vi.fn();
	const mixes = new MixUploads({
		song: () => ({ id: "song1", mixes: Array.from({ length: mixCount }) }),
		onuploaded,
		open,
		showMixes,
	});
	return { mixes, onuploaded, open, showMixes };
}

beforeEach(() => {
	uploadMixFile.mockClear();
	postJson.mockClear();
	notify.mockClear();
});

describe("MixUploads", () => {
	test("an unsupported format is refused with a notification and nothing goes up", async () => {
		const { mixes, onuploaded } = setup();
		await mixes.upload([file("mix.wav"), file("notes.txt")]);
		expect(notify).toHaveBeenCalledWith(
			expect.stringMatching(/^Not a supported format \(.+\): notes\.txt$/),
			{ kind: "error" },
		);
		expect(uploadMixFile).not.toHaveBeenCalled();
		expect(onuploaded).not.toHaveBeenCalled();
		expect(mixes.busy).toBe(false);
	});

	test("a file over the size limit is refused with the same message as before", async () => {
		const { mixes } = setup();
		await mixes.upload([file("big.wav", STEM_MAX_BYTES + 1)]);
		expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^Over the .+ limit: big\.wav$/), {
			kind: "error",
		});
		expect(uploadMixFile).not.toHaveBeenCalled();
	});

	test("more mixes than the song has room for are refused", async () => {
		const { mixes } = setup(MAX_MIXES_PER_SONG - 1);
		await mixes.upload([file("a.mp3"), file("b.mp3")]);
		expect(notify).toHaveBeenCalledWith(
			`Only 1 more mix fit on this song (${MAX_MIXES_PER_SONG} max).`,
			{ kind: "error" },
		);
		expect(uploadMixFile).not.toHaveBeenCalled();
	});

	test("uploads one at a time with busy set across the batch, then opens the newest", async () => {
		const { mixes, open, onuploaded } = setup();
		const busy: boolean[] = [];
		let inFlight = 0;
		uploadMixFile.mockImplementation(async (f, reserve, opts) => {
			inFlight++;
			expect(inFlight).toBe(1);
			busy.push(mixes.busy);
			await reserve();
			opts.onProgress?.(100);
			inFlight--;
			return { mixId: `mix-${f.name}`, version: 1 };
		});
		await mixes.upload([file("a.mp3"), file("b.wav")]);
		expect(busy).toEqual([true, true]);
		expect(mixes.busy).toBe(false);
		expect(mixes.jobs).toEqual([]);
		expect(postJson).toHaveBeenNthCalledWith(1, "/api/mixes", {
			songId: "song1",
			filename: "a.mp3",
			sizeBytes: 10,
		});
		expect(notify).toHaveBeenCalledWith("2 mixes uploaded");
		expect(open).toHaveBeenCalledWith("mix-b.wav");
		expect(onuploaded).not.toHaveBeenCalled();
		uploadMixFile.mockReset();
	});

	test("a failed file keeps its error row and the rest continue", async () => {
		uploadMixFile.mockImplementation(async (f, reserve) => {
			await reserve();
			if (f.name.startsWith("bad")) throw new Error("Upload refused");
			return { mixId: `mix-${f.name}`, version: 1 };
		});
		const { mixes, open } = setup();
		await mixes.upload([file("bad.mp3"), file("good.mp3")]);
		expect(uploadMixFile).toHaveBeenCalledTimes(2);
		expect(mixes.jobs[0].error).toBe("Upload refused");
		expect(mixes.jobs[1].error).toBeUndefined();
		expect(open).toHaveBeenCalledWith("mix-good.mp3");
	});

	test("a batch where every file failed refreshes the page instead", async () => {
		uploadMixFile.mockImplementation(async () => {
			throw new Error("nope");
		});
		const { mixes, open, onuploaded } = setup();
		await mixes.upload([file("bad.mp3")]);
		expect(onuploaded).toHaveBeenCalled();
		expect(open).not.toHaveBeenCalled();
		expect(notify).not.toHaveBeenCalled();
	});

	test("pick shows the mixes, then opens the list's picker", async () => {
		const { mixes, showMixes } = setup();
		const pick = vi.fn();
		mixes.list = { pick } as never;
		await mixes.pick();
		expect(showMixes).toHaveBeenCalled();
		expect(pick).toHaveBeenCalled();
	});
});
