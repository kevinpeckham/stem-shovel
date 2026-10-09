import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { matches, type Row } from "../../../tests/helpers/fakeDb";

// Turso enforces no foreign keys, so cascade.ts is the only thing that
// removes a parent's children. The fake database logs every delete and
// update; the tests check the set and the order against the schema's own
// foreign keys, so a child table added without joining the cascade fails here.
const fake = await vi.hoisted(async () => (await import("../../../tests/helpers/fakeDb")).fakeDb());
vi.mock("#lib/server/db/index.js", async () => ({
	db: fake,
	schema: await import("#lib/server/db/schema/index.js"),
}));

const schema = await import("#lib/server/db/schema/index.js");
const {
	deleteAccountRows,
	deleteArtistRows,
	deleteBugReportRows,
	deleteIdeaRows,
	deleteProjectRows,
	deleteSongRows,
	deleteUserDocRows,
	deleteUserRows,
} = await import("./cascade");

const tables = (Object.values(schema) as unknown[]).filter((v): v is Table => is(v, Table));

/** Every foreign key pointing at `parent`: the child table's SQL name, the JS key of the column and the declared rule. */
function foreignKeysTo(parent: Table) {
	const out: { table: string; key: string; onDelete: string }[] = [];
	for (const t of tables) {
		const columns = Object.entries(getTableColumns(t));
		for (const fk of getTableConfig(t).foreignKeys) {
			const ref = fk.reference();
			if (getTableName(ref.foreignTable) !== getTableName(parent)) continue;
			const key = columns.find(([, c]) => c === ref.columns[0])?.[0] ?? ref.columns[0].name;
			out.push({ table: getTableName(t), key, onDelete: fk.onDelete ?? "no action" });
		}
	}
	return out;
}

const deletes = () => fake.calls.filter((c) => c.op === "delete").map((c) => c.table);
const updates = () => fake.calls.filter((c) => c.op === "update");
const firstDelete = (table: string) =>
	fake.calls.find((c) => c.op === "delete" && c.table === table);
const position = (table: string) => deletes().indexOf(table);

/**
 * What the cascade owes a parent's children and did not do: a cascade child
 * never deleted; a set-null child neither updated with that column nulled
 * nor deleted (the cascade may remove rows the schema would only detach,
 * like a user's private-note revisions).
 */
function missingFor(parent: Table) {
	const nulled = (table: string, key: string) =>
		updates().some((u) => u.table === table && (u.values as Row | undefined)?.[key] === null);
	return foreignKeysTo(parent)
		.filter(({ table, key, onDelete }) =>
			onDelete === "cascade"
				? !deletes().includes(table)
				: !nulled(table, key) && !deletes().includes(table),
		)
		.map(({ table, key }) => `${table}.${key}`);
}

beforeEach(() => fake.reset());

describe("deleteIdeaRows", () => {
	beforeEach(() =>
		fake.reset({
			idea: [
				{ id: "i1", accountId: "a1" },
				{ id: "i2", accountId: "a1" },
				{ id: "i3", accountId: "a1" },
			],
			recording: [
				{ id: "r1", ideaId: "i1", accountId: "a1" },
				{ id: "r2", ideaId: "i1", accountId: "a1" },
				{ id: "r9", ideaId: "i2", accountId: "a1" },
			],
			recordingStem: [
				{ id: "rs1", recordingId: "r1", accountId: "a1" },
				{ id: "rs9", recordingId: "r9", accountId: "a1" },
			],
			studioRevision: [{ id: "v1", ideaId: "i1", accountId: "a1" }],
			studioSource: [{ id: "src1", ideaId: "i1", accountId: "a1" }],
		}),
	);
	test("the Studio rows and the takes' stems go before the takes, the takes before the idea", async () => {
		await deleteIdeaRows(["i1"]);
		expect(deletes()).toEqual([
			"studio_revision",
			"studio_source",
			"recording_stem",
			"recording",
			"idea",
		]);
		const stems = firstDelete("recording_stem")?.where;
		expect(matches(stems, { recordingId: "r1" })).toBe(true);
		expect(matches(stems, { recordingId: "r2" })).toBe(true);
		expect(matches(stems, { recordingId: "r9" })).toBe(false);
		expect(fake.rows("idea").map((i) => i.id)).toEqual(["i2", "i3"]);
		expect(fake.rows("recording").map((r) => r.id)).toEqual(["r9"]);
		expect(fake.rows("recordingStem").map((r) => r.id)).toEqual(["rs9"]);
		expect(fake.rows("studioRevision")).toEqual([]);
		expect(fake.rows("studioSource")).toEqual([]);
	});
	test("an idea without takes skips the stems' delete; no ids means no queries", async () => {
		await deleteIdeaRows(["i3"]);
		expect(deletes()).toEqual(["studio_revision", "studio_source", "recording", "idea"]);
		await deleteIdeaRows([]);
		expect(fake.calls.filter((c) => c.op !== "select").length).toBe(4);
		expect(fake.rows("recording").map((r) => r.id)).toEqual(["r1", "r2", "r9"]);
		expect(fake.rows("idea").map((i) => i.id)).toEqual(["i1", "i2"]);
	});
	test("covers every table with a foreign key to idea", async () => {
		await deleteIdeaRows(["i1"]);
		expect(missingFor(schema.idea)).toEqual([]);
	});
});

describe("deleteSongRows", () => {
	beforeEach(() =>
		fake.reset({
			song: [
				{ id: "s1", accountId: "a1", projectId: "p1" },
				{ id: "s2", accountId: "a1", projectId: "p1" },
			],
			comment: [
				{ id: "c1", songId: "s1", accountId: "a1", userId: "u1" },
				{ id: "c2", songId: "s2", accountId: "a1", userId: "u1" },
			],
			commentVersion: [
				{ id: "cv1", commentId: "c1" },
				{ id: "cv2", commentId: "c2" },
			],
			aiRequest: [
				{ id: "ai1", songId: "s1" },
				{ id: "ai2", songId: "s2" },
			],
			beat: [{ id: "b1", songId: "s1", accountId: "a1" }],
			slugAlias: [{ id: "al1", targetId: "s1", kind: "song" }],
		}),
	);
	test("children deepest first, the song last; AI requests and beats lose the song rather than going", async () => {
		await deleteSongRows(["s1"]);
		expect(deletes()).toEqual([
			"song_credit",
			"song_doc_version",
			"song_user_note",
			"comment_version",
			"comment",
			"chat_message",
			"chat_read",
			"song_mix",
			"share_link",
			"demo",
			"song_pdf",
			"song_notation",
			"stem",
			"slug_alias",
			"song",
		]);
		expect(updates().map((u) => [u.table, u.values])).toEqual([
			["ai_request", { songId: null }],
			["beat", { songId: null }],
		]);
		expect(fake.rows("aiRequest")).toEqual([
			{ id: "ai1", songId: null },
			{ id: "ai2", songId: "s2" },
		]);
		expect(fake.rows("commentVersion")).toEqual([{ id: "cv2", commentId: "c2" }]);
		expect(fake.rows("comment").map((c) => c.id)).toEqual(["c2"]);
		expect(fake.rows("slugAlias")).toEqual([]);
		expect(fake.rows("song").map((s) => s.id)).toEqual(["s2"]);
	});
	test("without comments the versions' delete is skipped", async () => {
		fake.reset({ song: [{ id: "s1", accountId: "a1" }] });
		await deleteSongRows(["s1"]);
		expect(deletes()).not.toContain("comment_version");
		expect(deletes()).toContain("comment");
	});
	test("covers every table with a foreign key to song", async () => {
		await deleteSongRows(["s1"]);
		expect(missingFor(schema.song)).toEqual([]);
	});
});

describe("deleteProjectRows", () => {
	beforeEach(() =>
		fake.reset({
			project: [
				{ id: "p1", accountId: "a1" },
				{ id: "p2", accountId: "a1" },
			],
			song: [
				{ id: "s1", projectId: "p1", accountId: "a1" },
				{ id: "s2", projectId: "p2", accountId: "a1" },
			],
		}),
	);
	test("finds the project's songs, cascades them, then the project's own children and the project", async () => {
		await deleteProjectRows(["p1"]);
		expect(fake.calls[0]).toMatchObject({ op: "select", table: "song" });
		expect(matches(fake.calls[0].where, { projectId: "p1" })).toBe(true);
		expect(matches(fake.calls[0].where, { projectId: "p2" })).toBe(false);
		const songDelete = firstDelete("song")?.where;
		expect(matches(songDelete, { id: "s1" })).toBe(true);
		expect(matches(songDelete, { id: "s2" })).toBe(false);
		expect(deletes().slice(position("song") + 1)).toEqual([
			"song_pdf",
			"share_link",
			"project_member",
			"invitation",
			"slug_alias",
			"project",
		]);
		expect(fake.rows("project").map((p) => p.id)).toEqual(["p2"]);
		expect(fake.rows("song").map((s) => s.id)).toEqual(["s2"]);
	});
	test("covers every table with a foreign key to project", async () => {
		await deleteProjectRows(["p1"]);
		expect(missingFor(schema.project)).toEqual([]);
	});
});

describe("deleteArtistRows, deleteBugReportRows, deleteUserDocRows", () => {
	test("credits and members go before the artist", async () => {
		await deleteArtistRows(["ar1"]);
		expect(deletes()).toEqual(["song_credit", "artist_member", "artist"]);
		expect(missingFor(schema.artist)).toEqual([]);
	});
	test("votes go before the report, versions before the doc", async () => {
		await deleteBugReportRows(["b1"]);
		expect(deletes()).toEqual(["bug_report_vote", "bug_report"]);
		expect(missingFor(schema.bugReport)).toEqual([]);
		fake.reset();
		await deleteUserDocRows(["d1"]);
		expect(deletes()).toEqual(["user_doc_version", "user_doc"]);
		expect(missingFor(schema.userDoc)).toEqual([]);
	});
	test("nothing to delete is no query", async () => {
		await deleteArtistRows([]);
		await deleteBugReportRows([]);
		await deleteUserDocRows([]);
		await deleteProjectRows([]);
		await deleteSongRows([]);
		expect(fake.calls).toEqual([]);
	});
});

describe("deleteAccountRows", () => {
	beforeEach(() =>
		fake.reset({
			account: [{ id: "a1" }, { id: "a2" }],
			project: [
				{ id: "p1", accountId: "a1" },
				{ id: "p2", accountId: "a2" },
			],
			song: [
				{ id: "s1", accountId: "a1", projectId: "p1" },
				{ id: "s0", accountId: "a1", projectId: null },
			],
			artist: [{ id: "ar1", accountId: "a1" }],
			idea: [{ id: "i1", accountId: "a1" }],
			recording: [
				{ id: "r1", accountId: "a1", ideaId: "i1" },
				{ id: "r0", accountId: "a1", ideaId: null },
			],
			comment: [{ id: "c1", accountId: "a1", songId: "s1" }],
			shortLink: [
				{ id: "sl1", accountId: "a1" },
				{ id: "sl2", accountId: "a2" },
			],
			auditLog: [{ id: "au1", accountId: "a1" }],
			supportRequest: [{ id: "sr1", accountId: "a1" }],
		}),
	);
	test("the account goes last, after its projects, artists, ideas and the songs and takes filed outside them", async () => {
		await deleteAccountRows("a1");
		const d = deletes();
		expect(d.at(-1)).toBe("account");
		expect(d.filter((t) => t === "account")).toHaveLength(1);
		// Projects, artists and ideas cascade before the backstop sweeps; parents after their children.
		expect(position("project")).toBeGreaterThan(position("song"));
		expect(position("idea")).toBeGreaterThan(position("studio_revision"));
		expect(position("idea")).toBeGreaterThan(position("recording"));
		expect(position("recording")).toBeGreaterThan(position("recording_stem"));
		expect(position("artist")).toBeGreaterThan(position("song_credit"));
		expect(position("account_member")).toBeLessThan(position("account"));
		// The song without a project and the take without an idea are swept too.
		expect(fake.rows("song")).toEqual([]);
		expect(fake.rows("recording")).toEqual([]);
		expect(fake.rows("project").map((p) => p.id)).toEqual(["p2"]);
		expect(fake.rows("account").map((a) => a.id)).toEqual(["a2"]);
	});
	test("audit lines, support requests and short links keep their text and lose the account", async () => {
		await deleteAccountRows("a1");
		expect(fake.rows("auditLog")).toEqual([{ id: "au1", accountId: null }]);
		expect(fake.rows("supportRequest")).toEqual([{ id: "sr1", accountId: null }]);
		expect(fake.rows("shortLink")).toEqual([
			{ id: "sl1", accountId: null },
			{ id: "sl2", accountId: "a2" },
		]);
		expect(deletes()).not.toContain("audit_log");
		expect(deletes()).not.toContain("support_request");
		expect(deletes()).not.toContain("short_link");
	});
	test("covers every table with a foreign key to account", async () => {
		await deleteAccountRows("a1");
		expect(missingFor(schema.account)).toEqual([]);
	});
});

describe("deleteUserRows", () => {
	test("the user's own rows go; what they made for others stays without an author", async () => {
		fake.reset({
			user: [{ id: "u1" }, { id: "u2" }],
			accountMember: [
				{ id: "m1", userId: "u1", accountId: "a1" },
				{ id: "m2", userId: "u2", accountId: "a1" },
			],
			comment: [{ id: "c1", userId: "u1", songId: "s1", accountId: "a1" }],
			commentVersion: [
				{ id: "cv1", commentId: "c1", editedBy: "u1" },
				{ id: "cv2", commentId: "c2", editedBy: "u1" },
			],
			song: [
				{ id: "s1", createdBy: "u1" },
				{ id: "s2", createdBy: "u2" },
			],
			studioRevision: [{ id: "v1", savedBy: "u1" }],
			songDocVersion: [
				{ id: "dv1", userId: "u1", createdBy: "u1" },
				{ id: "dv2", userId: null, createdBy: "u1" },
			],
		});
		await deleteUserRows("u1");
		expect(deletes().at(-1)).toBe("user");
		expect(fake.rows("user")).toEqual([{ id: "u2" }]);
		expect(fake.rows("accountMember")).toEqual([{ id: "m2", userId: "u2", accountId: "a1" }]);
		expect(fake.rows("comment")).toEqual([]);
		// Their comment's revisions went with it; a revision they edited on someone else's comment stays, unattributed.
		expect(fake.rows("commentVersion")).toEqual([{ id: "cv2", commentId: "c2", editedBy: null }]);
		expect(fake.rows("song")).toEqual([
			{ id: "s1", createdBy: null },
			{ id: "s2", createdBy: "u2" },
		]);
		expect(fake.rows("studioRevision")).toEqual([{ id: "v1", savedBy: null }]);
		// Private-note revisions go; shared-document revisions keep the text and lose the author.
		expect(fake.rows("songDocVersion")).toEqual([{ id: "dv2", userId: null, createdBy: null }]);
	});
	test("every cascade foreign key to user is deleted and every set-null one is nulled", async () => {
		await deleteUserRows("u1");
		// Derived from the schema: a new column referencing user that the cascade forgets lands here.
		expect(missingFor(schema.user)).toEqual([]);
	});
});
