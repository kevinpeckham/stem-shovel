import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/**
 * Authorization of the project chat feed (docs/chat.md, "The project
 * page"): whoever reads the songs' chats reads the feed, the account's
 * members (on a restricted project, those added) and the project's
 * people, viewers included; it is read under the project's account.
 */
const feed = vi.hoisted(() => ({ projectChatFeed: vi.fn() }));
vi.mock("#lib/server/projectChat.js", () => feed);

const remote = await import("./projectChat.remote");

const PROJECT = fakeId("proj-one");
const PAGE = { messages: [], more: false };

beforeEach(() => {
	resetRemoteMocks();
	givenRow("project", { accountId: ACCOUNT });
	givenRow("account", { slug: "band", name: "Band" });
	feed.projectChatFeed.mockResolvedValue(PAGE);
});

describe("projectChatFeed", () => {
	const input = { projectId: PROJECT };
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(remote.projectChatFeed, input)).rejects.toMatchObject(httpError(401));
		expect(feed.projectChatFeed).not.toHaveBeenCalled();
	});
	it("404 for a stranger to the account", async () => {
		asOutsider();
		await expect(call(remote.projectChatFeed, input)).rejects.toMatchObject(httpError(404));
		expect(feed.projectChatFeed).not.toHaveBeenCalled();
	});
	it("404 for a project that does not exist", async () => {
		asEditorOf(ACCOUNT);
		givenRow("project", null);
		await expect(call(remote.projectChatFeed, input)).rejects.toMatchObject(httpError(404));
	});
	it("a viewer of the account reads, under the project's account, with the default page", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(remote.projectChatFeed, input)).resolves.toEqual(PAGE);
		expect(feed.projectChatFeed).toHaveBeenCalledWith(ACCOUNT, PROJECT, {
			before: undefined,
			limit: 50,
		});
	});
	it("a project viewer from outside the account reads, with the cursor passed on", async () => {
		asOutsider();
		data.projectRoleOf.mockResolvedValue("viewer");
		await call(remote.projectChatFeed, { ...input, before: 1234, limit: 10 });
		expect(feed.projectChatFeed).toHaveBeenCalledWith(ACCOUNT, PROJECT, {
			before: 1234,
			limit: 10,
		});
	});
	it("a member not added to a restricted project may not", async () => {
		asEditorOf(ACCOUNT);
		data.projectRestricted.mockResolvedValue(true);
		await expect(call(remote.projectChatFeed, input)).rejects.toMatchObject(httpError(404));
	});
	it("a limit past the most is refused by the schema", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(remote.projectChatFeed, { ...input, limit: 500 })).rejects.toBeDefined();
		expect(feed.projectChatFeed).not.toHaveBeenCalled();
	});
});
