import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { callsTo, fake, reset } from "../../../tests/helpers/fakeDataLayer";

const {
	commentOwnership,
	commentVersionById,
	createComment,
	deleteComment,
	listComments,
	listCommentVersions,
	updateComment,
} = await import("./data");

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const at = (ms: number) => new Date(ms);
const s1 = { id: "s1", accountId: "a1", projectId: "p1" };
const u1 = { id: "u1", name: "Ann", email: "ann@example.com" };
const u2 = { id: "u2", name: "Bob", email: "bob@example.com" };
const c1 = {
	id: "c1",
	accountId: "a1",
	songId: "s1",
	userId: "u1",
	title: "Intro",
	body: "Too long",
	at: 12.5,
	editedAt: null,
	createdAt: at(1),
};
const version = (id: string, ms: number, over: Record<string, unknown> = {}) => ({
	id,
	commentId: "c1",
	title: `t${id}`,
	body: `b${id}`,
	at: null,
	editedBy: "u2",
	createdAt: at(ms),
	...over,
});

beforeAll(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => reset({ song: [s1], user: [u1, u2], comment: [c1] }));

describe("listComments", () => {
	test("the song's comments oldest first with their author, nothing of another song", async () => {
		reset({
			user: [u1, u2],
			comment: [
				{ ...c1, id: "c2", userId: "u2", createdAt: at(2), editedAt: at(3) },
				c1,
				{ ...c1, id: "c3", songId: "s2" },
			],
		});
		expect(await listComments("s1")).toEqual([
			{
				id: "c1",
				userId: "u1",
				authorName: "Ann",
				title: "Intro",
				body: "Too long",
				at: 12.5,
				createdAt: at(1),
				editedAt: null,
			},
			{
				id: "c2",
				userId: "u2",
				authorName: "Bob",
				title: "Intro",
				body: "Too long",
				at: 12.5,
				createdAt: at(2),
				editedAt: at(3),
			},
		]);
		expect(await listComments("s9")).toEqual([]);
	});
});

describe("createComment", () => {
	test("a comment on a song of the account; null across it", async () => {
		const made = await createComment("a1", "s1", "u2", {
			title: "Bridge",
			body: "Louder",
			at: null,
		});
		expect(made?.id).toMatch(/^[A-Za-z0-9_-]{21}$/);
		expect(fake.rows("comment")[1]).toMatchObject({
			accountId: "a1",
			songId: "s1",
			userId: "u2",
			title: "Bridge",
			body: "Louder",
			at: null,
			editedAt: null,
		});
		expect(await createComment("a2", "s1", "u2", { title: "x", body: "y", at: 1 })).toBeNull();
		expect(callsTo("insert", "comment")).toHaveLength(1);
	});
});

describe("commentOwnership", () => {
	test("the account, author and song of a comment, for the permission checks", async () => {
		expect(await commentOwnership("c1")).toEqual({
			id: "c1",
			accountId: "a1",
			userId: "u1",
			songId: "s1",
		});
		expect(await commentOwnership("nope")).toBeUndefined();
	});
});

describe("updateComment", () => {
	test("the text it replaces goes to comment_version with who replaced it; the comment is stamped edited", async () => {
		expect(await updateComment("c1", { title: "Intro", body: "Shorter", at: 12.5 }, "u2")).toEqual({
			id: "c1",
		});
		expect(callsTo("insert", "comment_version")[0].values).toEqual({
			commentId: "c1",
			title: "Intro",
			body: "Too long",
			at: 12.5,
			editedBy: "u2",
		});
		expect(fake.rows("comment")[0]).toMatchObject({ body: "Shorter", editedAt: at(NOW) });
	});
	test("an edit that changes nothing writes no revision; a stranger is null", async () => {
		expect(await updateComment("c1", { title: "Intro", body: "Too long", at: 12.5 })).toEqual({
			id: "c1",
		});
		expect(callsTo("insert", "comment_version")).toEqual([]);
		expect(await updateComment("nope", { title: "x", body: "y", at: null })).toBeNull();
		expect(callsTo("update", "comment")).toHaveLength(1);
	});
	test("a changed position alone is a revision, with editedBy null when nobody is named", async () => {
		await updateComment("c1", { title: "Intro", body: "Too long", at: 13 });
		expect(callsTo("insert", "comment_version")[0].values).toMatchObject({
			at: 12.5,
			editedBy: null,
		});
	});
	test("only the ten newest revisions are kept, this comment's alone", async () => {
		reset({
			comment: [c1],
			commentVersion: [
				...Array.from({ length: 10 }, (_, i) => version(`v${i}`, i + 1)),
				version("elsewhere", 0, { commentId: "c2" }),
			],
		});
		await updateComment("c1", { title: "New", body: "Too long", at: 12.5 }, "u1");
		const left = fake.rows("commentVersion").map((v) => v.id);
		expect(left).toHaveLength(12 - 1);
		expect(left).not.toContain("v0");
		expect(left).toContain("v1");
		expect(left).toContain("elsewhere");
		expect(callsTo("delete", "comment_version")).toHaveLength(1);
	});
});

describe("listCommentVersions", () => {
	test("newest first with who replaced each text, ten at most", async () => {
		reset({
			user: [u2],
			commentVersion: [
				version("v1", 1, { at: 3 }),
				version("v2", 2, { editedBy: null }),
				...Array.from({ length: 10 }, (_, i) => version(`later${i}`, 100 + i)),
				version("elsewhere", 999, { commentId: "c2" }),
			],
		});
		const versions = await listCommentVersions("c1");
		expect(versions).toHaveLength(10);
		expect(versions[0]).toEqual({
			id: "later9",
			title: "tlater9",
			body: "blater9",
			at: null,
			createdAt: 109,
			editedBy: { name: "Bob" },
		});
		expect(versions.map((v) => v.id)).not.toContain("v1");
		reset({
			user: [u2],
			commentVersion: [version("v1", 1, { at: 3 }), version("v2", 2, { editedBy: null })],
		});
		expect(await listCommentVersions("c1")).toEqual([
			{ id: "v2", title: "tv2", body: "bv2", at: null, createdAt: 2, editedBy: null },
			{ id: "v1", title: "tv1", body: "bv1", at: 3, createdAt: 1, editedBy: { name: "Bob" } },
		]);
	});
});

describe("commentVersionById", () => {
	test("one revision by both ids; a revision of another comment is null", async () => {
		reset({ commentVersion: [version("v1", 1, { at: 2 }), version("v2", 2, { commentId: "c2" })] });
		expect(await commentVersionById("c1", "v1")).toEqual({
			id: "v1",
			title: "tv1",
			body: "bv1",
			at: 2,
		});
		expect(await commentVersionById("c1", "v2")).toBeNull();
		expect(await commentVersionById("c1", "nope")).toBeNull();
	});
});

describe("deleteComment", () => {
	test("removes the comment and its revisions, and nothing of another comment", async () => {
		reset({
			comment: [c1, { ...c1, id: "c2" }],
			commentVersion: [version("v1", 1), version("v2", 2, { commentId: "c2" })],
		});
		expect(await deleteComment("c1")).toBe(true);
		expect(fake.rows("comment").map((c) => c.id)).toEqual(["c2"]);
		expect(fake.rows("commentVersion").map((v) => v.id)).toEqual(["v2"]);
		expect(await deleteComment("nope")).toBe(false);
	});
});
