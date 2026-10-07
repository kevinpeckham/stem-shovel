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
 * Authorization of the comment remote functions: any member of the song's
 * account posts, project viewers included; the author edits; the author or
 * an owner / admin deletes.
 */
const comments = await import("./comments.remote");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const COMMENT = fakeId("comment-one");

beforeEach(() => {
	resetRemoteMocks();
	givenRow("song", { accountId: ACCOUNT, projectId: PROJECT });
	givenRow("account", { slug: "band", name: "Band" });
});

describe("createComment", () => {
	const input = { songId: SONG, title: "Intro", body: "Louder", position: "" };
	beforeEach(() => data.createComment.mockResolvedValue({ id: COMMENT }));
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(comments.createComment, input)).rejects.toMatchObject(httpError(401));
	});
	it("404 for a stranger to the account", async () => {
		asOutsider();
		await expect(call(comments.createComment, input)).rejects.toMatchObject(httpError(404));
		expect(data.createComment).not.toHaveBeenCalled();
	});
	it("a viewer of the account posts", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(comments.createComment, input)).resolves.toEqual({ id: COMMENT });
		expect(data.createComment).toHaveBeenCalledWith(ACCOUNT, SONG, USER, {
			title: "Intro",
			body: "Louder",
			at: null,
		});
	});
	it("a project viewer from outside the account posts under the song's account", async () => {
		asOutsider();
		data.projectRoleOf.mockResolvedValue("viewer");
		await expect(call(comments.createComment, input)).resolves.toEqual({ id: COMMENT });
		expect(data.createComment).toHaveBeenCalledWith(ACCOUNT, SONG, OTHER_USER, expect.anything());
	});
	it("a member not added to a restricted project may not", async () => {
		asEditorOf(ACCOUNT);
		data.projectRestricted.mockResolvedValue(true);
		await expect(call(comments.createComment, input)).rejects.toMatchObject(httpError(404));
	});
});

describe("updateComment", () => {
	const input = { id: COMMENT, title: "Intro", body: "Softer", position: "" };
	beforeEach(() =>
		data.commentOwnership.mockResolvedValue({ songId: SONG, accountId: ACCOUNT, userId: USER }),
	);
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(comments.updateComment, input)).rejects.toMatchObject(httpError(401));
	});
	it("403 for anyone but the author, an owner of the account included", async () => {
		asMemberOf(ACCOUNT, "owner", { userId: OTHER_USER });
		await expect(call(comments.updateComment, input)).rejects.toMatchObject(httpError(403));
		expect(data.updateComment).not.toHaveBeenCalled();
	});
	it("404 for a comment that does not exist", async () => {
		asEditorOf(ACCOUNT);
		data.commentOwnership.mockResolvedValue(null);
		await expect(call(comments.updateComment, input)).rejects.toMatchObject(httpError(404));
	});
	it("the author edits it", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(comments.updateComment, input)).resolves.toEqual({ id: COMMENT });
		expect(data.updateComment).toHaveBeenCalledWith(
			COMMENT,
			{ title: "Intro", body: "Softer", at: null },
			USER,
		);
	});
});

describe("deleteComment", () => {
	const input = { id: COMMENT };
	beforeEach(() =>
		data.commentOwnership.mockResolvedValue({
			songId: SONG,
			accountId: ACCOUNT,
			userId: OTHER_USER,
		}),
	);
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(comments.deleteComment, input)).rejects.toMatchObject(httpError(401));
	});
	it("403 for a member who is not the author", async () => {
		asMemberOf(ACCOUNT, "member");
		await expect(call(comments.deleteComment, input)).rejects.toMatchObject(httpError(403));
		expect(data.deleteComment).not.toHaveBeenCalled();
	});
	it("403 for an admin of a different account", async () => {
		asAdminOf(OTHER_ACCOUNT);
		await expect(call(comments.deleteComment, input)).rejects.toMatchObject(httpError(403));
	});
	it("the author deletes it", async () => {
		asMemberOf(ACCOUNT, "member", { userId: OTHER_USER });
		await expect(call(comments.deleteComment, input)).resolves.toEqual({ deleted: true });
		expect(data.deleteComment).toHaveBeenCalledWith(COMMENT);
	});
	it("an admin of the account deletes it", async () => {
		asAdminOf(ACCOUNT);
		await expect(call(comments.deleteComment, input)).resolves.toEqual({ deleted: true });
		expect(data.deleteComment).toHaveBeenCalledWith(COMMENT);
	});
});
