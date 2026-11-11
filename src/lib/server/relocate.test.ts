import { describe, expect, test, vi } from "vite-plus/test";

/**
 * The store a song's files belong in: private when the song or its project
 * is; a song whose project row is gone (foreign keys are off) answers as
 * the song itself says rather than failing.
 */
const fake = await vi.hoisted(async () => (await import("../../../tests/helpers/fakeDb")).fakeDb());
vi.mock("#lib/server/db/index.js", async () => ({
	db: fake,
	schema: await import("#lib/server/db/schema/index.js"),
}));
vi.mock("#lib/server/blob.js", () => ({
	moveBlob: vi.fn(),
	projectIdOfPathname: vi.fn(),
	songIdOfPathname: vi.fn(),
}));

const { accessOfSongId, relocateSongFiles } = await import("./relocate");
const { moveBlob } = await import("#lib/server/blob.js");

describe("accessOfSongId", () => {
	test("private when the song or its project is, public otherwise, null for no song", async () => {
		fake.reset({
			project: [
				{ id: "p1", isPrivate: false },
				{ id: "p2", isPrivate: true },
			],
			song: [
				{ id: "s1", projectId: "p1", isPrivate: false },
				{ id: "s2", projectId: "p1", isPrivate: true },
				{ id: "s3", projectId: "p2", isPrivate: false },
			],
		});
		expect(await accessOfSongId("s1")).toBe("public");
		expect(await accessOfSongId("s2")).toBe("private");
		expect(await accessOfSongId("s3")).toBe("private");
		expect(await accessOfSongId("nope")).toBeNull();
	});
	test("a song whose project row is gone is as private as the song says", async () => {
		fake.reset({ song: [{ id: "s4", projectId: "gone", isPrivate: false }] });
		expect(await accessOfSongId("s4")).toBe("public");
	});
});

describe("relocateSongFiles", () => {
	test("a file two arrangements' rows share moves once, and both rows take its new URL", async () => {
		const pub = (p: string) => `https://x.public.blob.vercel-storage.com/${p}`;
		const shared = { url: pub("s1/a.wav"), playbackUrl: pub("s1/a.play.m4a"), midiUrl: null };
		fake.reset({
			song: [{ id: "s1", projectId: "p1", isPrivate: true, mixUrl: null }],
			project: [{ id: "p1", isPrivate: false }],
			stem: [
				{ id: "m1", songId: "s1", arrangementId: null, ...shared },
				{ id: "c1", songId: "s1", arrangementId: "arr1", ...shared },
			],
		});
		vi.mocked(moveBlob).mockImplementation(async (url) =>
			url.replace(".public.", ".private.").replace(".wav", ".m1.wav"),
		);
		expect(await relocateSongFiles("s1")).toBe(2);
		expect(moveBlob).toHaveBeenCalledTimes(2);
		const rows = fake.rows("stem");
		expect(rows[0].url).toBe(rows[1].url);
		expect(rows[0].playbackUrl).toBe(rows[1].playbackUrl);
		expect(rows[0].url).toMatch(/\.private\./);
	});
});
