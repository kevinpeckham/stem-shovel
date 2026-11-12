import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

/** Demo uploads with the upload calls recorded: each file reports progress, or fails when named so. */
const uploadDemoFile = vi.hoisted(() =>
	vi.fn(
		async (file: File, reserve: () => Promise<unknown>, onProgress?: (percent: number) => void) => {
			await reserve();
			if (file.name.startsWith("bad")) throw new Error("Upload refused");
			onProgress?.(50);
			onProgress?.(100);
		},
	),
);
const postJson = vi.hoisted(() => vi.fn(async () => ({ demoId: "d1", pathname: "p" })));
vi.mock("#lib/upload.js", () => ({ uploadDemoFile, postJson }));
const removeDemoById = vi.hoisted(() =>
	vi.fn<(d: { id: string }) => Promise<{ deleted: boolean }>>(async () => ({ deleted: true })),
);
vi.mock("#lib/remote/songs.remote.js", () => ({ removeDemoById }));
const notify = vi.hoisted(() => vi.fn());
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify }));

const { DemoUploads } = await import("./demoUploads.svelte.js");
const { MAX_DEMOS_PER_SONG } = await import("#lib/constants/demoFormats.js");
const { STEM_MAX_BYTES } = await import("#lib/constants/stemFormats.js");

/** A file input stand-in holding the picked files. */
function input(files: File[]) {
	return { files, value: "picked" } as unknown as HTMLInputElement;
}
function file(name: string, size = 10) {
	const f = new File(["x"], name);
	Object.defineProperty(f, "size", { value: size });
	return f;
}
function setup(demoCount = 0) {
	const onuploaded = vi.fn(async () => {});
	const demos = new DemoUploads({
		song: () => ({ id: "song1", demos: Array.from({ length: demoCount }) }),
		onuploaded,
	});
	return { demos, onuploaded };
}

beforeEach(() => {
	uploadDemoFile.mockClear();
	postJson.mockClear();
	removeDemoById.mockClear();
	notify.mockClear();
	vi.unstubAllGlobals();
});

describe("DemoUploads", () => {
	test("an unsupported format sets the notice and uploads nothing", async () => {
		const { demos, onuploaded } = setup();
		const el = input([file("memo.m4a"), file("notes.txt")]);
		demos.upload(el);
		expect(demos.notice).toMatch(/^Not a supported format \(.+\): notes\.txt$/);
		expect(el.value).toBe("");
		expect(uploadDemoFile).not.toHaveBeenCalled();
		expect(onuploaded).not.toHaveBeenCalled();
		expect(demos.busy).toBe(false);
	});

	test("a file over the size limit sets the notice and uploads nothing", async () => {
		const { demos } = setup();
		demos.upload(input([file("big.wav", STEM_MAX_BYTES + 1)]));
		expect(demos.notice).toMatch(/^Over the .+ limit: big\.wav$/);
		expect(uploadDemoFile).not.toHaveBeenCalled();
	});

	test("more files than the song has room for sets the notice and uploads nothing", async () => {
		const { demos } = setup(MAX_DEMOS_PER_SONG - 1);
		demos.upload(input([file("a.mp3"), file("b.mp3")]));
		expect(demos.notice).toBe(`Only 1 more demo fit on this song (${MAX_DEMOS_PER_SONG} max).`);
		expect(uploadDemoFile).not.toHaveBeenCalled();
	});

	test("a valid pick waits as pending, with empty notes, and uploads nothing", async () => {
		const { demos, onuploaded } = setup();
		demos.notice = "an earlier refusal";
		const el = input([file("a.mp3"), file("b.m4a")]);
		demos.upload(el);
		expect(el.value).toBe("");
		expect(demos.notice).toBeNull();
		expect(demos.pickedFrom).toBe(el);
		expect(demos.pending?.map((p) => [p.file.name, p.notes])).toEqual([
			["a.mp3", ""],
			["b.m4a", ""],
		]);
		expect(uploadDemoFile).not.toHaveBeenCalled();
		expect(onuploaded).not.toHaveBeenCalled();
	});

	test("a refused pick never becomes pending", () => {
		const { demos } = setup();
		demos.upload(input([file("notes.txt")]));
		expect(demos.pending).toBeNull();
	});

	test("cancel drops the pick and uploads nothing", async () => {
		const { demos, onuploaded } = setup();
		demos.upload(input([file("a.mp3")]));
		demos.cancel();
		expect(demos.pending).toBeNull();
		await demos.start();
		expect(uploadDemoFile).not.toHaveBeenCalled();
		expect(onuploaded).not.toHaveBeenCalled();
	});

	test("start sends each file with its own notes, tracks each file's percent, then clears the jobs", async () => {
		const { demos, onuploaded } = setup();
		const seen: number[] = [];
		uploadDemoFile.mockImplementationOnce(async (_f, reserve, onProgress) => {
			await reserve();
			expect(demos.busy).toBe(true);
			onProgress?.(40);
			seen.push(demos.jobs[0].percent);
		});
		demos.upload(input([file("a.mp3"), file("b.m4a")]));
		demos.pending![0].notes = "  The bridge idea\nlisten at 1:20  ";
		const started = demos.start();
		expect(demos.pending).toBeNull();
		await started;
		expect(seen).toEqual([40]);
		expect(postJson).toHaveBeenNthCalledWith(1, "/api/demos", {
			songId: "song1",
			filename: "a.mp3",
			sizeBytes: 10,
			notes: "The bridge idea\nlisten at 1:20",
		});
		expect(postJson).toHaveBeenNthCalledWith(2, "/api/demos", {
			songId: "song1",
			filename: "b.m4a",
			sizeBytes: 10,
			notes: "",
		});
		expect(uploadDemoFile).toHaveBeenCalledTimes(2);
		expect(onuploaded).toHaveBeenCalledOnce();
		expect(demos.busy).toBe(false);
		expect(demos.jobs).toEqual([]);
	});

	test("a failed file keeps its error, the others their percent", async () => {
		const { demos, onuploaded } = setup();
		demos.upload(input([file("a.mp3"), file("bad.mp3")]));
		await demos.start();
		expect(onuploaded).toHaveBeenCalledOnce();
		expect(demos.busy).toBe(false);
		expect(demos.jobs).toEqual([
			{ name: "a.mp3", percent: 100 },
			{ name: "bad.mp3", percent: 0, error: "Upload refused" },
		]);
	});
});

describe("DemoUploads.remove", () => {
	const demo = { id: "d1", label: "Voice memo" };

	test("confirmed: removes the demo, says so and refreshes", async () => {
		const confirm = vi.fn(() => true);
		vi.stubGlobal("confirm", confirm);
		const { demos, onuploaded } = setup();
		await demos.remove(demo);
		expect(confirm).toHaveBeenCalledWith('Remove the demo "Voice memo"? The file is deleted.');
		expect(removeDemoById).toHaveBeenCalledWith({ id: "d1" });
		expect(notify).toHaveBeenCalledWith("Voice memo removed");
		expect(onuploaded).toHaveBeenCalledOnce();
	});

	test("not confirmed: nothing happens", async () => {
		vi.stubGlobal("confirm", () => false);
		const { demos, onuploaded } = setup();
		await demos.remove(demo);
		expect(removeDemoById).not.toHaveBeenCalled();
		expect(notify).not.toHaveBeenCalled();
		expect(onuploaded).not.toHaveBeenCalled();
	});

	test("refused: an error notification, no refresh", async () => {
		vi.stubGlobal("confirm", () => true);
		removeDemoById.mockRejectedValueOnce(new Error("Demo not found"));
		const { demos, onuploaded } = setup();
		await demos.remove(demo);
		expect(notify).toHaveBeenCalledWith("Could not remove it: Demo not found", { kind: "error" });
		expect(onuploaded).not.toHaveBeenCalled();
	});
});
