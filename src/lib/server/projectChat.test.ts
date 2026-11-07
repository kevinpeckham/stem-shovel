import { beforeEach, describe, expect, test } from "vite-plus/test";
import { reset } from "../../../tests/helpers/fakeDataLayer";

/** The project page's chat feed (docs/chat.md, "The project page"): every song's messages, newest first, paged, scoped to the account. */
const { projectChatFeed } = await import("./projectChat");

const at = (ms: number) => new Date(ms);
const message = (id: string, songId: string, ms: number, over: Record<string, unknown> = {}) => ({
	id,
	accountId: "a1",
	songId,
	userId: "u1",
	body: `said ${id}`,
	editedAt: null,
	createdAt: at(ms),
	updatedAt: at(ms),
	...over,
});

const fixtures = {
	user: [{ id: "u1", name: "Pat" }],
	song: [
		{ id: "s1", accountId: "a1", projectId: "p1", title: "Intro", slug: "intro" },
		{ id: "s2", accountId: "a1", projectId: "p1", title: "Bridge", slug: "bridge" },
		{ id: "s3", accountId: "a1", projectId: "p2", title: "Elsewhere", slug: "elsewhere" },
		{ id: "s4", accountId: "a2", projectId: "p1", title: "Stranger", slug: "stranger" },
	],
	chatMessage: [
		message("m1", "s1", 10),
		message("m2", "s2", 20, { editedAt: at(25) }),
		message("m3", "s1", 30),
		message("m4", "s3", 40),
		message("m5", "s4", 50, { accountId: "a2" }),
	],
};

beforeEach(() => reset(fixtures));

describe("projectChatFeed", () => {
	test("the project's songs' messages, newest first, each with its song and author; other projects and accounts left out", async () => {
		const out = await projectChatFeed("a1", "p1");
		expect(out.more).toBe(false);
		expect(out.messages.map((m) => m.id)).toEqual(["m3", "m2", "m1"]);
		expect(out.messages[1]).toEqual({
			id: "m2",
			songId: "s2",
			songTitle: "Bridge",
			songSlug: "bridge",
			userId: "u1",
			authorName: "Pat",
			body: "said m2",
			createdAt: 20,
			editedAt: 25,
			attachments: [],
		});
	});
	test("a page of `limit` says there is more, and `before` pages back from a message's time", async () => {
		const first = await projectChatFeed("a1", "p1", { limit: 2 });
		expect(first.messages.map((m) => m.id)).toEqual(["m3", "m2"]);
		expect(first.more).toBe(true);
		const next = await projectChatFeed("a1", "p1", { limit: 2, before: 20 });
		expect(next.messages.map((m) => m.id)).toEqual(["m1"]);
		expect(next.more).toBe(false);
	});
	test("a project of another account, or with no songs, has no messages", async () => {
		expect(await projectChatFeed("a2", "p2")).toEqual({ messages: [], more: false });
		expect(await projectChatFeed("a1", "nope")).toEqual({ messages: [], more: false });
	});
	test('each message carries its ready files, oldest first, in one query for the page (docs/chat.md, "Attachments")', async () => {
		const file = (id: string, over: Record<string, unknown>) => ({
			id,
			accountId: "a1",
			songId: "s1",
			messageId: "m3",
			sessionMessageId: null,
			kind: "image",
			status: "ready",
			url: `https://blob/${id}.png`,
			pathname: `accounts/a1/chat/${id}.png`,
			filename: `${id}.png`,
			contentType: "image/png",
			sizeBytes: 10,
			width: 4,
			height: 3,
			thumbnailUrl: null,
			thumbnailPathname: null,
			shareCode: `code-${id}`,
			uploadedBy: "u1",
			createdAt: at(5),
			updatedAt: at(5),
			...over,
		});
		reset({
			...fixtures,
			chatAttachment: [
				file("f2", { createdAt: at(7) }),
				file("f1", {}),
				file("f3", { status: "uploading" }),
				file("f4", { messageId: "m1" }),
			],
		});
		const out = await projectChatFeed("a1", "p1");
		expect(out.messages[0].attachments.map((f) => f.id)).toEqual(["f1", "f2"]);
		expect(out.messages[0].attachments[0]).toEqual({
			id: "f1",
			filename: "f1.png",
			kind: "image",
			contentType: "image/png",
			sizeBytes: 10,
			url: "https://blob/f1.png",
			thumbnailUrl: null,
			width: 4,
			height: 3,
			shareCode: "code-f1",
		});
		expect(out.messages[1].attachments).toEqual([]);
		expect(out.messages[2].attachments.map((f) => f.id)).toEqual(["f4"]);
	});
	test("the limit is held to the most", async () => {
		const out = await projectChatFeed("a1", "p1", { limit: 1000 });
		expect(out.messages).toHaveLength(3);
	});
});
