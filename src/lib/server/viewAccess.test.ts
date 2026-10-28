import { describe, expect, test, vi } from "vite-plus/test";
import {
	canCommentProject,
	canEditProject,
	canViewRecording,
	canViewSession,
	canViewSetList,
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

describe("canViewRecording", () => {
	const tape = { id: "r1", isPublic: false, sessionId: "s1" };
	const grantR1 = [{ code: "z", projectId: null, songId: null, recordingId: "r1" }];
	const stranger: Viewer = { accountRole: null, projectRoles: {} };
	test("a public recording is open to everyone", () => {
		expect(canViewRecording({ ...tape, isPublic: true }, NOBODY, [])).toBe(true);
		expect(canViewRecording({ ...tape, isPublic: true }, stranger, grantP1)).toBe(true);
	});
	test("a private recording: the account's members, or its link", () => {
		expect(canViewRecording(tape, NOBODY, [])).toBe(false);
		expect(canViewRecording(tape, stranger, grantP1)).toBe(false);
		expect(canViewRecording(tape, member, [])).toBe(true);
		expect(canViewRecording(tape, NOBODY, grantR1)).toBe(true);
		expect(canViewRecording({ ...tape, id: "r2" }, NOBODY, grantR1)).toBe(false);
	});
	test("a session's link opens every recording of that session, no other", () => {
		const grantS1 = [{ code: "s", projectId: null, songId: null, sessionId: "s1" }];
		expect(canViewRecording(tape, NOBODY, grantS1)).toBe(true);
		expect(canViewRecording({ ...tape, id: "r2" }, NOBODY, grantS1)).toBe(true);
		expect(canViewRecording({ ...tape, sessionId: "s2" }, NOBODY, grantS1)).toBe(false);
		expect(canViewRecording({ ...tape, sessionId: null }, NOBODY, grantS1)).toBe(false);
		expect(
			canViewRecording({ ...tape, sessionId: "" }, NOBODY, [{ ...grantS1[0], sessionId: "" }]),
		).toBe(false);
	});
});

describe("canViewSession", () => {
	const session = { id: "s1" };
	const grantS1 = [{ code: "s", projectId: null, songId: null, sessionId: "s1" }];
	test("the account's members", () => {
		expect(canViewSession(session, member, [])).toBe(true);
		expect(canViewSession(session, NOBODY, [])).toBe(false);
	});
	test("a visitor holding the session's link, not a recording's", () => {
		expect(canViewSession(session, NOBODY, grantS1)).toBe(true);
		expect(canViewSession({ id: "s2" }, NOBODY, grantS1)).toBe(false);
		expect(
			canViewSession(session, NOBODY, [
				{ code: "z", projectId: null, songId: null, recordingId: "r1" },
			]),
		).toBe(false);
	});
});

describe("canViewSetList", () => {
	const list = { id: "l1" };
	const grantL1 = [{ code: "l", projectId: null, songId: null, setListId: "l1" }];
	test("the account's members, a viewer-role member included", () => {
		expect(canViewSetList(list, member, [])).toBe(true);
		expect(canViewSetList(list, { accountRole: "viewer", projectRoles: {} }, [])).toBe(true);
		expect(canViewSetList(list, NOBODY, [])).toBe(false);
	});
	test("a visitor holding the set list's link, not another's or a session's", () => {
		expect(canViewSetList(list, NOBODY, grantL1)).toBe(true);
		expect(canViewSetList({ id: "l2" }, NOBODY, grantL1)).toBe(false);
		expect(
			canViewSetList(list, NOBODY, [{ code: "s", projectId: null, songId: null, sessionId: "l1" }]),
		).toBe(false);
	});
});
