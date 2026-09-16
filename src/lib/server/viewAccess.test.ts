import { describe, expect, test, vi } from "vite-plus/test";
import { canViewProject, canViewSong, rememberShareCodes, shareCodesFrom } from "./viewAccess";

describe("shareCodesFrom", () => {
	test("the URL's code comes first, then the cookie's, without repeats", () => {
		const url = new URL("https://x.test/a?share=NEW1");
		expect(shareCodesFrom(url, { get: () => "OLD1,NEW1,OLD2" })).toEqual(["NEW1", "OLD1", "OLD2"]);
	});
	test("nothing carried gives an empty list", () => {
		expect(shareCodesFrom(new URL("https://x.test/a"), { get: () => undefined })).toEqual([]);
	});
});

describe("rememberShareCodes", () => {
	test("writes a long-lived, http-only cookie for the whole site", () => {
		const set = vi.fn();
		rememberShareCodes({ set }, ["A", "B"]);
		expect(set).toHaveBeenCalledWith(
			"share",
			"A,B",
			expect.objectContaining({ path: "/", httpOnly: true }),
		);
	});
});

describe("canViewProject / canViewSong", () => {
	const project = { id: "p1", accountId: "a1", isPrivate: true };
	const song = { id: "s1", projectId: "p1", isPrivate: false, project: { isPrivate: false } };
	test("public things are open to everyone", () => {
		expect(canViewProject({ ...project, isPrivate: false }, false, [])).toBe(true);
		expect(canViewSong(song, false, [])).toBe(true);
	});
	test("members always see their own", () => {
		expect(canViewProject(project, true, [])).toBe(true);
		expect(canViewSong({ ...song, isPrivate: true }, true, [])).toBe(true);
	});
	test("a private song needs a song or project grant", () => {
		const s = { ...song, isPrivate: true };
		expect(canViewSong(s, false, [])).toBe(false);
		expect(canViewSong(s, false, [{ code: "x", projectId: null, songId: "s1" }])).toBe(true);
		expect(canViewSong(s, false, [{ code: "x", projectId: "p1", songId: null }])).toBe(true);
		expect(canViewSong(s, false, [{ code: "x", projectId: "p2", songId: null }])).toBe(false);
	});
	test("a private project makes its songs private, and a song grant does not open the project", () => {
		const inherited = { ...song, project: { isPrivate: true } };
		expect(canViewSong(inherited, false, [])).toBe(false);
		expect(canViewSong(inherited, false, [{ code: "x", projectId: null, songId: "s1" }])).toBe(
			true,
		);
		expect(canViewProject(project, false, [{ code: "x", projectId: null, songId: "s1" }])).toBe(
			false,
		);
	});
});
