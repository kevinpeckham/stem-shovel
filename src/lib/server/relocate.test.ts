import { describe, expect, test, vi } from "vite-plus/test";

/**
 * The store a song's files belong in: private when the song or its project
 * is; a song whose project row is gone (foreign keys are off) answers as
 * the song itself says rather than failing.
 */
const fake = await vi.hoisted(async () => (await import("../../../tests/helpers/fakeDb")).fakeDb());
vi.mock("$lib/server/db", async () => ({
	db: fake,
	schema: await import("$lib/server/db/schema"),
}));
vi.mock("$lib/server/blob", () => ({
	moveBlob: vi.fn(),
	projectIdOfPathname: vi.fn(),
	songIdOfPathname: vi.fn(),
}));

const { accessOfSongId } = await import("./relocate");

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
