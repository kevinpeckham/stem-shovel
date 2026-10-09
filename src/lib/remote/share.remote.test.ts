import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asUser,
	asViewerOf,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Authorization of privacy and share links: editors of the song's or project's account. */
const share = await import("./share.remote");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const LINK = fakeId("link-one");

beforeEach(() => {
	resetRemoteMocks();
	givenRow("song", { accountId: ACCOUNT, projectId: PROJECT });
	givenRow("project", { accountId: ACCOUNT });
});

describe("privacy", () => {
	const cases = [
		{
			name: "setProjectPrivate",
			fn: share.setProjectPrivate,
			input: { id: PROJECT, isPrivate: "true" },
			dataFn: "setProjectPrivacy",
			args: [ACCOUNT, PROJECT, true],
		},
		{
			name: "setSongPrivate",
			fn: share.setSongPrivate,
			input: { id: SONG, isPrivate: "false" },
			dataFn: "setSongPrivacy",
			args: [ACCOUNT, SONG, false],
		},
	];
	for (const c of cases) {
		describe(c.name, () => {
			it("401 signed out", async () => {
				asSignedOut();
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(401));
			});
			it("404 for an outsider and for a viewer", async () => {
				asOutsider();
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(404));
				asViewerOf(ACCOUNT);
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("an editor sets it within the account", async () => {
				asEditorOf(ACCOUNT);
				data[c.dataFn].mockResolvedValue(true);
				await expect(call(c.fn, c.input)).resolves.toEqual({ isPrivate: c.args[2] });
				expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
			});
		});
	}
});

describe("createShareLink", () => {
	beforeEach(() => data.createShareLink.mockResolvedValue({ code: "abc" }));
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(share.createShareLink, { songId: SONG })).rejects.toMatchObject(
			httpError(401),
		);
	});
	it("404 for an outsider and for a viewer", async () => {
		asOutsider();
		await expect(call(share.createShareLink, { songId: SONG })).rejects.toMatchObject(
			httpError(404),
		);
		asViewerOf(ACCOUNT);
		await expect(call(share.createShareLink, { projectId: PROJECT })).rejects.toMatchObject(
			httpError(404),
		);
		expect(data.createShareLink).not.toHaveBeenCalled();
	});
	it("a link for a mix (docs/mixes.md): the mix must be the song's, and the link records it", async () => {
		asEditorOf(ACCOUNT);
		const MIX = fakeId("mix-one");
		data.mixOwnership.mockResolvedValue({ id: MIX, songId: fakeId("song-two") });
		await expect(call(share.createShareLink, { songId: SONG, mixId: MIX })).rejects.toMatchObject(
			httpError(404),
		);
		data.mixOwnership.mockResolvedValue({ id: MIX, songId: SONG });
		await expect(call(share.createShareLink, { songId: SONG, mixId: MIX })).resolves.toEqual({
			code: "abc",
		});
		expect(data.createShareLink).toHaveBeenLastCalledWith(
			ACCOUNT,
			USER,
			{ songId: SONG, mixId: MIX },
			{ note: "", maxUses: null, expiresDays: 0 },
		);
	});
	it("an editor makes one for a song, or a project, under the account and as themselves", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(share.createShareLink, { songId: SONG })).resolves.toEqual({ code: "abc" });
		expect(data.createShareLink).toHaveBeenCalledWith(
			ACCOUNT,
			USER,
			{ songId: SONG },
			{ note: "", maxUses: null, expiresDays: 0 },
		);
		await call(share.createShareLink, { projectId: PROJECT, maxUses: "3", expiresDays: "7" });
		expect(data.createShareLink).toHaveBeenLastCalledWith(
			ACCOUNT,
			USER,
			{ projectId: PROJECT },
			{ note: "", maxUses: 3, expiresDays: 7 },
		);
	});
});

describe("revokeShareLink", () => {
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(share.revokeShareLink, { id: LINK })).rejects.toMatchObject(httpError(401));
	});
	it("404 for a user in no account, nothing searched", async () => {
		asUser();
		await expect(call(share.revokeShareLink, { id: LINK })).rejects.toMatchObject(httpError(404));
		expect(data.revokeShareLink).not.toHaveBeenCalled();
	});
	it("404 for a viewer-role member, nothing searched", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(share.revokeShareLink, { id: LINK })).rejects.toMatchObject(httpError(404));
		expect(data.revokeShareLink).not.toHaveBeenCalled();
	});
	it("an editor revokes within their own accounts only", async () => {
		asEditorOf(ACCOUNT);
		data.revokeShareLink.mockResolvedValue(true);
		await expect(call(share.revokeShareLink, { id: LINK })).resolves.toEqual({ revoked: true });
		expect(data.revokeShareLink).toHaveBeenCalledWith(ACCOUNT, LINK);
		expect(data.revokeShareLink).toHaveBeenCalledTimes(1);
	});
	it("404 when the link is in none of them", async () => {
		asEditorOf(ACCOUNT);
		data.revokeShareLink.mockResolvedValue(false);
		await expect(call(share.revokeShareLink, { id: LINK })).rejects.toMatchObject(httpError(404));
	});
});
