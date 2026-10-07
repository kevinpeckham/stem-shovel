import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_ACCOUNT,
	OTHER_USER,
	USER,
	asAdminOf,
	asEditorOf,
	asMemberOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/**
 * Authorization of the version-history remote functions: reading takes a
 * signed-in person who may view the song (songViewerOf), restoring a
 * shared document takes an editor, a private note its owner, a comment its
 * author or an account admin.
 */
const history = await import("./history.remote");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const VERSION = fakeId("ver-one");
const COMMENT = fakeId("comment-one");

/** A private song in a public project: members see it, strangers do not. */
function givenPrivateSong() {
	data.songViewRow.mockResolvedValue({
		id: SONG,
		projectId: PROJECT,
		isPrivate: true,
		accountId: ACCOUNT,
		project: { isPrivate: false, isRestricted: false },
	});
	givenRow("song", { accountId: ACCOUNT, projectId: PROJECT });
}

beforeEach(() => {
	resetRemoteMocks();
	givenPrivateSong();
});

describe("docHistory", () => {
	const input = { songId: SONG, kind: "chart" };
	beforeEach(() => data.listDocVersions.mockResolvedValue([]));
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(history.docHistory, input)).rejects.toMatchObject(httpError(401));
	});
	it("404 for a stranger to a private song", async () => {
		asOutsider();
		await expect(call(history.docHistory, input)).rejects.toMatchObject(httpError(404));
		expect(data.listDocVersions).not.toHaveBeenCalled();
	});
	it("a viewer of the account reads the shared document's history", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(history.docHistory, input)).resolves.toEqual({ versions: [] });
		expect(data.listDocVersions).toHaveBeenCalledWith(SONG, "chart", null);
	});
	it("a project viewer from outside the account reads it too", async () => {
		asOutsider();
		data.projectRolesOf.mockResolvedValue({ [PROJECT]: "viewer" });
		await expect(call(history.docHistory, input)).resolves.toEqual({ versions: [] });
	});
	it("a visitor with a share code for the song reads it", async () => {
		asOutsider();
		data.openShareLinks.mockResolvedValue([{ code: "c", songId: SONG, projectId: null }]);
		await expect(call(history.docHistory, input)).resolves.toEqual({ versions: [] });
	});
	it("a private note's history is the caller's own rows only", async () => {
		asEditorOf(ACCOUNT);
		await call(history.docHistory, { songId: SONG, kind: "mynotes" });
		expect(data.listDocVersions).toHaveBeenCalledWith(SONG, "mynotes", USER);
	});
});

describe("restoreDocVersion", () => {
	const shared = { songId: SONG, kind: "chart", versionId: VERSION };
	const mine = { songId: SONG, kind: "mynotes", versionId: VERSION };
	beforeEach(() => {
		data.docVersionById.mockResolvedValue({ markdown: "# Old" });
		data.saveSongDoc.mockResolvedValue({ ok: true, version: 3, changed: true });
		data.saveUserNote.mockResolvedValue({
			ok: true,
			version: 2,
			changed: true,
			html: "<p>Old</p>",
		});
	});
	it("401 signed out, for either kind", async () => {
		asSignedOut();
		await expect(call(history.restoreDocVersion, mine)).rejects.toMatchObject(httpError(401));
		await expect(call(history.restoreDocVersion, shared)).rejects.toMatchObject(httpError(404));
	});
	it("404 for a stranger, for either kind", async () => {
		asOutsider();
		await expect(call(history.restoreDocVersion, shared)).rejects.toMatchObject(httpError(404));
		await expect(call(history.restoreDocVersion, mine)).rejects.toMatchObject(httpError(404));
		expect(data.saveSongDoc).not.toHaveBeenCalled();
		expect(data.saveUserNote).not.toHaveBeenCalled();
	});
	it("a viewer may not restore a shared document", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(history.restoreDocVersion, shared)).rejects.toMatchObject(httpError(404));
		expect(data.saveSongDoc).not.toHaveBeenCalled();
	});
	it("an editor restores a shared document through the same save as an edit", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(history.restoreDocVersion, shared)).resolves.toEqual({
			version: 3,
			changed: true,
			html: "<p># Old</p>",
		});
		expect(data.docVersionById).toHaveBeenCalledWith(SONG, "chart", null, VERSION);
		expect(data.saveSongDoc).toHaveBeenCalledWith(ACCOUNT, USER, SONG, "chart", "# Old", {
			confirmEmpty: true,
		});
	});
	it("a viewer restores their own private note, from their own revisions", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(history.restoreDocVersion, mine)).resolves.toEqual({
			version: 2,
			changed: true,
			html: "<p>Old</p>",
		});
		expect(data.docVersionById).toHaveBeenCalledWith(SONG, "mynotes", USER, VERSION);
		expect(data.saveUserNote).toHaveBeenCalledWith(SONG, USER, ACCOUNT, "# Old", undefined, {
			confirmEmpty: true,
		});
	});
});

describe("commentHistory", () => {
	beforeEach(() => {
		data.commentOwnership.mockResolvedValue({
			songId: SONG,
			accountId: ACCOUNT,
			userId: OTHER_USER,
		});
		data.listCommentVersions.mockResolvedValue([]);
	});
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(history.commentHistory, { commentId: COMMENT })).rejects.toMatchObject(
			httpError(401),
		);
	});
	it("404 for a stranger to the private song", async () => {
		asOutsider();
		await expect(call(history.commentHistory, { commentId: COMMENT })).rejects.toMatchObject(
			httpError(404),
		);
		expect(data.listCommentVersions).not.toHaveBeenCalled();
	});
	it("404 for a comment that does not exist", async () => {
		asEditorOf(ACCOUNT);
		data.commentOwnership.mockResolvedValue(null);
		await expect(call(history.commentHistory, { commentId: COMMENT })).rejects.toMatchObject(
			httpError(404),
		);
	});
	it("a member who may view the song reads it", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(history.commentHistory, { commentId: COMMENT })).resolves.toEqual({
			versions: [],
		});
		expect(data.listCommentVersions).toHaveBeenCalledWith(COMMENT);
	});
});

describe("restoreCommentVersion", () => {
	const input = { commentId: COMMENT, versionId: VERSION };
	beforeEach(() => {
		data.commentOwnership.mockResolvedValue({
			songId: SONG,
			accountId: ACCOUNT,
			userId: OTHER_USER,
		});
		data.commentVersionById.mockResolvedValue({ title: "T", body: "B", at: 1.5 });
	});
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(history.restoreCommentVersion, input)).rejects.toMatchObject(httpError(401));
	});
	it("403 for a member who is neither the author nor an admin", async () => {
		asMemberOf(ACCOUNT, "member");
		await expect(call(history.restoreCommentVersion, input)).rejects.toMatchObject(httpError(403));
		expect(data.updateComment).not.toHaveBeenCalled();
	});
	it("404 for an admin of a different account, who may not see the song", async () => {
		asAdminOf(OTHER_ACCOUNT);
		await expect(call(history.restoreCommentVersion, input)).rejects.toMatchObject(httpError(404));
		expect(data.updateComment).not.toHaveBeenCalled();
	});
	it("the author restores it through updateComment", async () => {
		asMemberOf(ACCOUNT, "member", { userId: OTHER_USER });
		await expect(call(history.restoreCommentVersion, input)).resolves.toEqual({ ok: true });
		expect(data.commentVersionById).toHaveBeenCalledWith(COMMENT, VERSION);
		expect(data.updateComment).toHaveBeenCalledWith(
			COMMENT,
			{ title: "T", body: "B", at: 1.5 },
			OTHER_USER,
		);
	});
	it("an admin of the comment's account restores it", async () => {
		asAdminOf(ACCOUNT);
		await expect(call(history.restoreCommentVersion, input)).resolves.toEqual({ ok: true });
		expect(data.updateComment).toHaveBeenCalledWith(COMMENT, expect.anything(), USER);
	});
});
