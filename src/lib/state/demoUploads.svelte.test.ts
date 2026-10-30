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
});

describe("DemoUploads", () => {
	test("an unsupported format sets the notice and uploads nothing", async () => {
		const { demos, onuploaded } = setup();
		const el = input([file("memo.m4a"), file("notes.txt")]);
		await demos.upload(el);
		expect(demos.notice).toMatch(/^Not a supported format \(.+\): notes\.txt$/);
		expect(el.value).toBe("");
		expect(uploadDemoFile).not.toHaveBeenCalled();
		expect(onuploaded).not.toHaveBeenCalled();
		expect(demos.busy).toBe(false);
	});

	test("a file over the size limit sets the notice and uploads nothing", async () => {
		const { demos } = setup();
		await demos.upload(input([file("big.wav", STEM_MAX_BYTES + 1)]));
		expect(demos.notice).toMatch(/^Over the .+ limit: big\.wav$/);
		expect(uploadDemoFile).not.toHaveBeenCalled();
	});

	test("more files than the song has room for sets the notice and uploads nothing", async () => {
		const { demos } = setup(MAX_DEMOS_PER_SONG - 1);
		await demos.upload(input([file("a.mp3"), file("b.mp3")]));
		expect(demos.notice).toBe(`Only 1 more demo fit on this song (${MAX_DEMOS_PER_SONG} max).`);
		expect(uploadDemoFile).not.toHaveBeenCalled();
	});

	test("a successful batch tracks each file's percent, then clears the jobs", async () => {
		const { demos, onuploaded } = setup();
		demos.notice = "an earlier refusal";
		const seen: number[] = [];
		uploadDemoFile.mockImplementationOnce(async (_f, reserve, onProgress) => {
			await reserve();
			expect(demos.busy).toBe(true);
			onProgress?.(40);
			seen.push(demos.jobs[0].percent);
		});
		await demos.upload(input([file("a.mp3"), file("b.m4a")]));
		expect(seen).toEqual([40]);
		expect(postJson).toHaveBeenCalledWith("/api/demos", {
			songId: "song1",
			filename: "a.mp3",
			sizeBytes: 10,
		});
		expect(uploadDemoFile).toHaveBeenCalledTimes(2);
		expect(onuploaded).toHaveBeenCalledOnce();
		expect(demos.notice).toBeNull();
		expect(demos.busy).toBe(false);
		expect(demos.jobs).toEqual([]);
	});

	test("a failed file keeps its error, the others their percent", async () => {
		const { demos, onuploaded } = setup();
		await demos.upload(input([file("a.mp3"), file("bad.mp3")]));
		expect(onuploaded).toHaveBeenCalledOnce();
		expect(demos.busy).toBe(false);
		expect(demos.jobs).toEqual([
			{ name: "a.mp3", percent: 100 },
			{ name: "bad.mp3", percent: 0, error: "Upload refused" },
		]);
	});
});
