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
import {
	background,
	data,
	givenRow,
	resetRemoteMocks,
} from "../../../tests/helpers/fakeServerModules";

/**
 * Authorization of the comments on a session's recordings
 * (docs/uploads-and-blob.md, "Sessions" review): any member of the account
 * posts; the author edits; the author or an owner / admin deletes. A
 * position is time, since a recording has no tempo grid.
 */
const remote = await import("./sessionComments.remote");

const RECORDING = fakeId("rec-one");
const COMMENT = fakeId("comment-one");

beforeEach(() => {
	resetRemoteMocks();
	givenRow("sessionRecording", { accountId: ACCOUNT });
	givenRow("account", { slug: "band", name: "Band" });
});

describe("createSessionComment", () => {
	const input = { recordingId: RECORDING, title: "Intro", body: "Rushed", position: "" };
	beforeEach(() => data.createSessionComment.mockResolvedValue({ id: COMMENT }));
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(remote.createSessionComment, input)).rejects.toMatchObject(httpError(401));
	});
	it("404 for a stranger to the account", async () => {
		asOutsider();
		await expect(call(remote.createSessionComment, input)).rejects.toMatchObject(httpError(404));
		expect(data.createSessionComment).not.toHaveBeenCalled();
	});
	it("a member posts, and the account hears of it", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(remote.createSessionComment, input)).resolves.toEqual({ id: COMMENT });
		expect(data.createSessionComment).toHaveBeenCalledWith(ACCOUNT, RECORDING, USER, {
			title: "Intro",
			body: "Rushed",
			at: null,
		});
		// The notice goes out after the response (background); the scheduler is called with it.
		expect(background).toHaveBeenCalledOnce();
	});
	it("a position is time; bars are refused", async () => {
		asEditorOf(ACCOUNT);
		await expect(
			call(remote.createSessionComment, { ...input, position: "1:02.5" }),
		).resolves.toEqual({ id: COMMENT });
		expect(data.createSessionComment).toHaveBeenLastCalledWith(
			ACCOUNT,
			RECORDING,
			USER,
			expect.objectContaining({ at: 62.5 }),
		);
		await expect(
			call(remote.createSessionComment, { ...input, position: "12|3" }),
		).rejects.toBeDefined();
	});
	it("404 for a recording that is gone", async () => {
		asEditorOf(ACCOUNT);
		data.createSessionComment.mockResolvedValue(null);
		await expect(call(remote.createSessionComment, input)).rejects.toMatchObject(httpError(404));
	});
});

describe("updateSessionComment", () => {
	const input = { id: COMMENT, title: "Intro", body: "Better", position: "0:30" };
	beforeEach(() =>
		data.sessionCommentOwnership.mockResolvedValue({
			id: COMMENT,
			accountId: ACCOUNT,
			userId: USER,
			recordingId: RECORDING,
		}),
	);
	it("403 for anyone but the author, an owner included", async () => {
		asMemberOf(ACCOUNT, "owner", { userId: OTHER_USER });
		await expect(call(remote.updateSessionComment, input)).rejects.toMatchObject(httpError(403));
		expect(data.updateSessionComment).not.toHaveBeenCalled();
	});
	it("404 for a comment that does not exist", async () => {
		asEditorOf(ACCOUNT);
		data.sessionCommentOwnership.mockResolvedValue(null);
		await expect(call(remote.updateSessionComment, input)).rejects.toMatchObject(httpError(404));
	});
	it("the author edits it", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(remote.updateSessionComment, input)).resolves.toEqual({ id: COMMENT });
		expect(data.updateSessionComment).toHaveBeenCalledWith(COMMENT, {
			title: "Intro",
			body: "Better",
			at: 30,
		});
	});
});

describe("deleteSessionComment", () => {
	const input = { id: COMMENT };
	beforeEach(() =>
		data.sessionCommentOwnership.mockResolvedValue({
			id: COMMENT,
			accountId: ACCOUNT,
			userId: OTHER_USER,
			recordingId: RECORDING,
		}),
	);
	it("403 for a member who is not the author", async () => {
		asMemberOf(ACCOUNT, "member");
		await expect(call(remote.deleteSessionComment, input)).rejects.toMatchObject(httpError(403));
		expect(data.deleteSessionComment).not.toHaveBeenCalled();
	});
	it("404 for an admin of a different account", async () => {
		asAdminOf(OTHER_ACCOUNT);
		await expect(call(remote.deleteSessionComment, input)).rejects.toMatchObject(httpError(404));
	});
	it("the author deletes it", async () => {
		asMemberOf(ACCOUNT, "member", { userId: OTHER_USER });
		await expect(call(remote.deleteSessionComment, input)).resolves.toEqual({ deleted: true });
		expect(data.deleteSessionComment).toHaveBeenCalledWith(COMMENT);
	});
	it("an admin of the account deletes it", async () => {
		asAdminOf(ACCOUNT);
		await expect(call(remote.deleteSessionComment, input)).resolves.toEqual({ deleted: true });
		expect(data.deleteSessionComment).toHaveBeenCalledWith(COMMENT);
	});
});
