import { describe, expect, test, vi } from "vite-plus/test";
import {
	canCommentProject,
	canEditProject,
	canViewProject,
	canViewSong,
	NOBODY,
	rememberShareCodes,
	shareCodesFrom,
	type Viewer,
} from "./viewAccess";

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

const owner: Viewer = { accountRole: "owner", projectRoles: {} };
const member: Viewer = { accountRole: "member", projectRoles: {} };
const memberOnP1: Viewer = { accountRole: "member", projectRoles: { p1: "member" } };
const viewerOnP1: Viewer = { accountRole: null, projectRoles: { p1: "viewer" } };
const grantP1 = [{ code: "x", projectId: "p1", songId: null }];
const grantS1 = [{ code: "y", projectId: null, songId: "s1" }];

describe("canViewProject / canViewSong", () => {
	const project = { id: "p1", isPrivate: true, isRestricted: false };
	const song = {
		id: "s1",
		projectId: "p1",
		isPrivate: false,
		project: { isPrivate: false, isRestricted: false },
	};
	test("public things are open to everyone", () => {
		expect(canViewProject({ ...project, isPrivate: false }, NOBODY, [])).toBe(true);
		expect(canViewSong(song, NOBODY, [])).toBe(true);
	});
	test("members of the account see its private work", () => {
		expect(canViewProject(project, member, [])).toBe(true);
		expect(canViewSong({ ...song, isPrivate: true }, member, [])).toBe(true);
	});
	test("a project viewer sees that project's private work, nothing else", () => {
		expect(canViewProject(project, viewerOnP1, [])).toBe(true);
		expect(canViewProject({ ...project, id: "p2" }, viewerOnP1, [])).toBe(false);
		expect(canViewSong({ ...song, isPrivate: true }, viewerOnP1, [])).toBe(true);
		expect(canViewSong({ ...song, projectId: "p2", isPrivate: true }, viewerOnP1, [])).toBe(false);
	});
	test("a private song needs a song or project grant", () => {
		const s = { ...song, isPrivate: true };
		expect(canViewSong(s, NOBODY, [])).toBe(false);
		expect(canViewSong(s, NOBODY, grantS1)).toBe(true);
		expect(canViewSong(s, NOBODY, grantP1)).toBe(true);
		expect(canViewSong(s, NOBODY, [{ code: "z", projectId: "p2", songId: null }])).toBe(false);
	});
	test("a song in a private project is private whatever its own flag", () => {
		const s = { ...song, project: { isPrivate: true, isRestricted: false } };
		expect(canViewSong(s, NOBODY, [])).toBe(false);
		expect(canViewSong(s, NOBODY, grantP1)).toBe(true);
	});
	test("a restricted project opens only to those added, the account's admins and share links", () => {
		const r = { ...project, isRestricted: true };
		expect(canViewProject(r, owner, [])).toBe(true);
		expect(canViewProject(r, member, [])).toBe(false);
		expect(canViewProject(r, memberOnP1, [])).toBe(true);
		expect(canViewProject(r, viewerOnP1, [])).toBe(true);
		expect(canViewProject(r, NOBODY, grantP1)).toBe(true);
		const s = { ...song, project: { isPrivate: false, isRestricted: true } };
		expect(canViewSong(s, member, [])).toBe(false);
		expect(canViewSong(s, memberOnP1, [])).toBe(true);
		expect(canViewSong(s, NOBODY, grantS1)).toBe(true);
	});
});

describe("canEditProject / canCommentProject", () => {
	const open = { id: "p1", isRestricted: false };
	const restricted = { id: "p1", isRestricted: true };
	test("owners, admins and members edit an open project; viewers and visitors do not", () => {
		expect(canEditProject(open, owner)).toBe(true);
		expect(canEditProject(open, member)).toBe(true);
		expect(canEditProject(open, viewerOnP1)).toBe(false);
		expect(canEditProject(open, NOBODY)).toBe(false);
	});
	test("a restricted project is edited by its added members and the account's admins only", () => {
		expect(canEditProject(restricted, owner)).toBe(true);
		expect(canEditProject(restricted, member)).toBe(false);
		expect(canEditProject(restricted, memberOnP1)).toBe(true);
		expect(canEditProject(restricted, viewerOnP1)).toBe(false);
	});
	test("commenting: whoever edits, plus the project's viewers", () => {
		expect(canCommentProject(open, member)).toBe(true);
		expect(canCommentProject(open, viewerOnP1)).toBe(true);
		expect(canCommentProject(restricted, member)).toBe(false);
		expect(canCommentProject(restricted, viewerOnP1)).toBe(true);
		expect(canCommentProject(open, NOBODY)).toBe(false);
	});
});
