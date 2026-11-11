import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../../../../../tests/helpers/fakeServerModules";
import { ACCOUNT, httpError } from "../../../../../../../../tests/helpers/fakeRequestEvent";
import {
	blob,
	data,
	jobs,
	resetRemoteMocks,
} from "../../../../../../../../tests/helpers/fakeServerModules";
import type { ShareGrant, Viewer } from "#lib/server/viewAccess.js";

/** A demo's own page: viewable like its song (a member, a share code, a public song), a 404 for a demo that is not the song's or not ready. */
const { load } = await import("./+page.server");

const SONG = { id: "song1", projectId: "proj1", title: "Clocks", slug: "clocks", isPrivate: true };
const PROJECT = { id: "proj1", name: "LP", slug: "lp", isPrivate: false, isRestricted: false };
const DEMO = {
	id: "demo1",
	accountId: ACCOUNT,
	songId: "song1",
	label: "Phone memo",
	status: "ready",
	url: "https://blob/demo1.m4a",
	filename: "demo1.m4a",
	sizeBytes: 1000,
	playbackStatus: "ready",
	playbackUrl: "https://blob/demo1.mp3",
	playbackStartedAt: null,
	peaks: [0.1, 0.5],
	peaksStartedAt: null,
	durationSeconds: 12,
	createdAt: new Date(0),
	uploader: { name: "Ann" },
};
const NOBODY: Viewer = { accountRole: null, projectRoles: {} };
const MEMBER: Viewer = { accountRole: "member", projectRoles: {} };
const VIEWER: Viewer = { accountRole: null, projectRoles: { proj1: "viewer" } };

const run = (who: Viewer, shareGrants: ShareGrant[] = []) =>
	load({
		params: { account: "acct", project: "lp", song: "clocks", demo: "demo1" },
		parent: async () => ({ account: { id: ACCOUNT, slug: "acct" }, who, shareGrants }),
	} as never) as Promise<Record<string, unknown>>;

beforeEach(() => {
	resetRemoteMocks();
	data.songDemo.mockResolvedValue({ song: { ...SONG, project: PROJECT }, demo: DEMO });
	data.listDemoComments.mockResolvedValue([
		{ id: "c1", demoId: "demo1", title: "Nice" },
		{ id: "c2", demoId: "demo2", title: "Other" },
	]);
	data.listShareLinks.mockResolvedValue([{ id: "l1" }]);
	data.demosWantingPlayback.mockReturnValue([]);
	data.demosWantingPeaks.mockReturnValue([]);
	blob.presentUrl.mockImplementation(async (url: string | null) => url && `signed:${url}`);
});

describe("demo page load", () => {
	it("reads the demo by the page's slugs under the account", async () => {
		await run(MEMBER);
		expect(data.songDemo).toHaveBeenCalledWith(ACCOUNT, "lp", "clocks", "demo1");
	});

	it("404 for no such song; 403 for a private song without a code; 404 for a demo that is not ready", async () => {
		data.songDemo.mockResolvedValueOnce(null);
		await expect(run(MEMBER)).rejects.toMatchObject(httpError(404));
		await expect(run(NOBODY)).rejects.toMatchObject(httpError(403));
		data.songDemo.mockResolvedValueOnce({ song: { ...SONG, project: PROJECT }, demo: null });
		await expect(run(MEMBER)).rejects.toMatchObject(httpError(404));
		data.songDemo.mockResolvedValueOnce({
			song: { ...SONG, project: PROJECT },
			demo: { ...DEMO, status: "uploading" },
		});
		await expect(run(MEMBER)).rejects.toMatchObject(httpError(404));
	});

	it("a restricted project stays closed to a member not added to it", async () => {
		data.songDemo.mockResolvedValue({
			song: { ...SONG, project: { ...PROJECT, isRestricted: true } },
			demo: DEMO,
		});
		await expect(run(MEMBER)).rejects.toMatchObject(httpError(403));
	});

	it("a signed-out visitor with the song's code listens: no share links, no commenting", async () => {
		const out = await run(NOBODY, [{ code: "CODE", songId: "song1", projectId: null }]);
		expect(out).toMatchObject({
			canEdit: false,
			canComment: false,
			shareLinks: [],
			song: { id: "song1", title: "Clocks", project: { name: "LP", slug: "lp" } },
			demo: {
				id: "demo1",
				label: "Phone memo",
				url: "signed:https://blob/demo1.m4a",
				playbackUrl: "signed:https://blob/demo1.mp3",
				peaks: [0.1, 0.5],
				uploader: { name: "Ann" },
			},
		});
		expect(data.listShareLinks).not.toHaveBeenCalled();
		// Only this demo's comments.
		expect((out.comments as { id: string }[]).map((c) => c.id)).toEqual(["c1"]);
	});

	it("a public song opens to anyone", async () => {
		data.songDemo.mockResolvedValue({
			song: { ...SONG, isPrivate: false, project: PROJECT },
			demo: DEMO,
		});
		await expect(run(NOBODY)).resolves.toMatchObject({ canEdit: false });
	});

	it("a project viewer comments; a member edits and gets the song's share links", async () => {
		await expect(run(VIEWER)).resolves.toMatchObject({ canEdit: false, canComment: true });
		const out = await run(MEMBER);
		expect(out).toMatchObject({ canEdit: true, canComment: true, shareLinks: [{ id: "l1" }] });
		expect(data.listShareLinks).toHaveBeenCalledWith({ songId: "song1" });
	});

	it("schedules the demo's missing MP3 and waveform in the jobs function", async () => {
		data.demosWantingPlayback.mockReturnValue(["demo1"]);
		data.demosWantingPeaks.mockReturnValue(["demo1"]);
		await run(MEMBER);
		expect(jobs.scheduleDemoPlayback).toHaveBeenCalledWith(["demo1"]);
		expect(jobs.scheduleDemoPeaks).toHaveBeenCalledWith(["demo1"]);
	});
});
