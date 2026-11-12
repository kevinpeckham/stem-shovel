import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "../../../../../../tests/helpers/fakeServerModules";
import { ACCOUNT } from "../../../../../../tests/helpers/fakeRequestEvent";
import {
	data,
	notifications,
	resetRemoteMocks,
} from "../../../../../../tests/helpers/fakeServerModules";
import type { Viewer } from "#lib/server/viewAccess.js";

/** The song page's load: the Demos view's new-comment counts are the signed-in person's own, and none signed out. */
vi.mock("#lib/server/songView.js", () => ({
	songView: vi.fn(async () => ({ docs: { chart: "", lyrics: "", notes: "" } })),
}));
vi.mock("#lib/server/mix.js", () => ({ mixKeyOf: vi.fn(() => null) }));
vi.mock("#lib/server/slugAlias.js", () => ({ renamedProjectPath: vi.fn(async () => null) }));

const { load } = await import("./+page.server");

const SONG = {
	id: "song1",
	projectId: "proj1",
	title: "Clocks",
	slug: "clocks",
	isPrivate: false,
	noAi: false,
	arrangementId: "alt",
	notation: [],
	files: [],
	demos: [],
	project: {
		id: "proj1",
		name: "LP",
		slug: "lp",
		isPrivate: false,
		isRestricted: false,
		noAi: false,
	},
};
const MEMBER: Viewer = { accountRole: "member", projectRoles: {} };

const run = (user: { id: string } | null) =>
	load({
		params: { account: "acct", project: "lp", song: "clocks" },
		parent: async () => ({
			account: { id: ACCOUNT, slug: "acct", name: "Band" },
			who: MEMBER,
			shareGrants: [],
		}),
		url: new URL("https://x/acct/projects/lp/clocks?arrangement=alt"),
		locals: { user },
	} as never) as Promise<Record<string, unknown>>;

beforeEach(() => {
	resetRemoteMocks();
	data.getSong.mockResolvedValue(SONG);
	data.listShareLinks.mockResolvedValue([]);
	data.listArtists.mockResolvedValue([]);
	data.getUserNote.mockResolvedValue(null);
	data.songChat.mockResolvedValue(null);
	data.listSessionRecordingsOfSong.mockResolvedValue([]);
	data.siteAmpPresets.mockResolvedValue([]);
	data.listAmpPresets.mockResolvedValue([]);
	data.stemStreaming.mockResolvedValue({});
	notifications.unreadDemoCommentCounts.mockResolvedValue({ demo1: 2 });
});

describe("song page load: demoNewComments", () => {
	it("is the signed-in person's unread demo comment counts for this song", async () => {
		const page = await run({ id: "user1" });
		expect(notifications.unreadDemoCommentCounts).toHaveBeenCalledWith("user1", "song1");
		expect(page.demoNewComments).toEqual({ demo1: 2 });
	});
	it("is empty signed out, with nothing asked", async () => {
		const page = await run(null);
		expect(notifications.unreadDemoCommentCounts).not.toHaveBeenCalled();
		expect(page.demoNewComments).toEqual({});
	});
});
