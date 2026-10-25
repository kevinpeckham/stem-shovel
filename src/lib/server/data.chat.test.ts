import { beforeEach, describe, expect, test } from "vite-plus/test";
import { callsTo, fake, reset } from "../../../tests/helpers/fakeDataLayer";

/**
 * The chat's data (docs/chat.md): the project page's summary (a count per
 * song, and the unread of others' messages past the person's mark), the
 * messages with their mentions and reactions, a reaction's toggle, the
 * people a mention may name, and a delete taking its reactions along.
 */
const {
	chatAudience,
	chatSummaryOf,
	createChatMessage,
	deleteChatMessage,
	deleteSessionChatMessage,
	listChatMessages,
	listSessionChatMessages,
	toggleChatReaction,
	updateChatMessage,
} = await import("./data");

const at = (ms: number) => new Date(ms);

beforeEach(() => reset({}));

describe("chatSummaryOf", () => {
	test("counts every message, and as unread the others' past the mark (all of them with no mark); one's own never", async () => {
		reset({
			chatMessage: [
				{ songId: "s1", userId: "me", createdAt: at(1) },
				{ songId: "s1", userId: "u2", createdAt: at(2) },
				{ songId: "s1", userId: "u2", createdAt: at(10) },
				{ songId: "s2", userId: "u2", createdAt: at(3) },
				{ songId: "s3", userId: "u2", createdAt: at(3) },
			],
			chatRead: [
				{ userId: "me", songId: "s1", readAt: at(5) },
				{ userId: "other", songId: "s2", readAt: at(9) },
			],
		});
		const out = await chatSummaryOf(["s1", "s2"], "me");
		expect(out.get("s1")).toEqual({ count: 3, unread: 1 });
		expect(out.get("s2")).toEqual({ count: 1, unread: 1 });
		expect(out.has("s3")).toBe(false);
	});
	test("no songs: nothing asked", async () => {
		expect((await chatSummaryOf([], "me")).size).toBe(0);
	});
});

const users = [
	{ id: "u1", name: "Ann" },
	{ id: "u2", name: "Bob" },
	{ id: "u3", name: "Cy" },
	{ id: "u4", name: "Dee" },
];
const message = (over: Record<string, unknown> = {}) => ({
	id: "m1",
	accountId: "a1",
	songId: "s1",
	userId: "u1",
	body: "@Bob louder",
	mentions: ["u2", "gone"],
	editedAt: null,
	createdAt: at(1),
	updatedAt: at(1),
	...over,
});
const reaction = (id: string, userId: string, emoji: string, messageId = "m1") => ({
	id,
	scope: "song",
	messageId,
	userId,
	emoji,
	createdAt: at(2),
	updatedAt: at(2),
});

describe("listChatMessages and listSessionChatMessages", () => {
	test("each message carries the people it mentions by name (a lost one dropped) and its reactions per emoji, lit for the viewer", async () => {
		reset({
			user: users,
			chatMessage: [message()],
			chatReaction: [
				reaction("r1", "u2", "🔥"),
				reaction("r2", "u1", "👍"),
				reaction("r3", "u3", "🔥"),
			],
		});
		const [row] = await listChatMessages("s1", 0, "u3");
		expect(row.mentions).toEqual([{ id: "u2", name: "Bob" }]);
		expect(row.reactions).toEqual([
			{ emoji: "👍", count: 1, mine: false, names: ["Ann"] },
			{ emoji: "🔥", count: 2, mine: true, names: ["Bob", "Cy"] },
		]);
		// Without a viewer nothing is anyone's own.
		const [plain] = await listChatMessages("s1");
		expect(plain.reactions.every((r) => !r.mine)).toBe(true);
	});
	test("a message from before mentions has none, and a session's chat reads the same way", async () => {
		reset({
			user: users,
			sessionChatMessage: [{ ...message({ mentions: null }), songId: undefined, sessionId: "x1" }],
			chatReaction: [{ ...reaction("r1", "u2", "👀"), scope: "session" }],
		});
		const [row] = await listSessionChatMessages("x1", 0, "u2");
		expect(row.mentions).toEqual([]);
		expect(row.reactions).toEqual([{ emoji: "👀", count: 1, mine: true, names: ["Bob"] }]);
	});
});

describe("createChatMessage and updateChatMessage", () => {
	test("the mentions are stored with the message (none as null) and come back by name", async () => {
		reset({ user: users, song: [{ id: "s1", accountId: "a1" }], chatMessage: [] });
		const made = await createChatMessage("a1", "s1", "u1", "@Bob hi", ["u2"]);
		expect(made?.mentions).toEqual([{ id: "u2", name: "Bob" }]);
		expect(made?.reactions).toEqual([]);
		expect(callsTo("insert", "chat_message")[0].values).toMatchObject({ mentions: ["u2"] });
		await createChatMessage("a1", "s1", "u1", "hi");
		expect(callsTo("insert", "chat_message")[1].values).toMatchObject({ mentions: null });
	});
	test("an edit replaces the mentions", async () => {
		reset({ user: users, chatMessage: [message()] });
		const row = await updateChatMessage("m1", "@Cy now", ["u3"]);
		expect(row?.mentions).toEqual([{ id: "u3", name: "Cy" }]);
		expect(row?.editedAt).not.toBeNull();
	});
});

describe("toggleChatReaction", () => {
	test("on when the person had not, off when they had; the message's updated_at moves so the poll carries it", async () => {
		reset({ user: users, chatMessage: [message()], chatReaction: [] });
		const on = await toggleChatReaction("song", "m1", "u2", "🎸");
		expect(on?.reactions).toEqual([{ emoji: "🎸", count: 1, mine: true, names: ["Bob"] }]);
		expect(callsTo("insert", "chat_reaction")[0].values).toMatchObject({
			scope: "song",
			messageId: "m1",
			userId: "u2",
			emoji: "🎸",
		});
		expect(callsTo("update", "chat_message")[0].values).toHaveProperty("updatedAt");
		const off = await toggleChatReaction("song", "m1", "u2", "🎸");
		expect(off?.reactions).toEqual([]);
		expect(fake.rows("chatReaction")).toEqual([]);
	});
	test("a message not in that chat: nothing written", async () => {
		reset({ user: users, chatMessage: [message()], sessionChatMessage: [], chatReaction: [] });
		expect(await toggleChatReaction("session", "m1", "u2", "👍")).toBeNull();
		expect(callsTo("insert", "chat_reaction")).toEqual([]);
	});
});

describe("deleting a message", () => {
	test("its reactions go first, in either chat", async () => {
		reset({
			chatMessage: [message()],
			sessionChatMessage: [{ ...message({ id: "m2" }), sessionId: "x1" }],
			chatReaction: [
				reaction("r1", "u2", "👍"),
				reaction("r2", "u2", "👍", "m2"),
				reaction("r3", "u3", "👍", "m9"),
			],
		});
		expect(await deleteChatMessage("m1")).toBe(true);
		await deleteSessionChatMessage("m2");
		expect(fake.rows("chatReaction").map((r) => r.id)).toEqual(["r3"]);
	});
});

describe("chatAudience", () => {
	const base = {
		user: users,
		song: [{ id: "s1", accountId: "a1", projectId: "p1" }],
		recordingSession: [{ id: "x1", accountId: "a1" }],
		accountMember: [
			{ id: "am1", accountId: "a1", userId: "u1", role: "owner" },
			{ id: "am2", accountId: "a1", userId: "u2", role: "member" },
		],
		projectMember: [{ id: "pm1", projectId: "p1", userId: "u4", role: "viewer" }],
	};
	test("a song's: the account's members and the project's own people, by name", async () => {
		reset({ ...base, project: [{ id: "p1", isRestricted: false }] });
		expect(await chatAudience("a1", { songId: "s1" })).toEqual([
			{ id: "u1", name: "Ann" },
			{ id: "u2", name: "Bob" },
			{ id: "u4", name: "Dee" },
		]);
	});
	test("a restricted project's leaves out the members not on it; a session's is the account's members", async () => {
		reset({ ...base, project: [{ id: "p1", isRestricted: true }] });
		expect((await chatAudience("a1", { songId: "s1" })).map((p) => p.id)).toEqual(["u1", "u4"]);
		expect((await chatAudience("a1", { sessionId: "x1" })).map((p) => p.id)).toEqual(["u1", "u2"]);
	});
	test("a song or session of another account: no one", async () => {
		reset({ ...base, project: [{ id: "p1", isRestricted: false }] });
		expect(await chatAudience("a2", { songId: "s1" })).toEqual([]);
		expect(await chatAudience("a2", { sessionId: "x1" })).toEqual([]);
	});
});
