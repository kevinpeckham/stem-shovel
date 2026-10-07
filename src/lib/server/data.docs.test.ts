import { NOTES_STALE_MS } from "$lib/constants/notesStale";
import { RELEASES_DOC_SLUG } from "$lib/constants/releasesDoc";
import type { Note } from "$lib/audio/chords";
import { hashMarkdown, renderMarkdown } from "$lib/server/markdown";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { callsTo, cascade, fake, reset } from "../../../tests/helpers/fakeDataLayer";

// The cascade runs for real here: a page's delete should take its versions.
const realCascade =
	await vi.importActual<typeof import("$lib/server/cascade")>("$lib/server/cascade");
cascade.deleteUserDocRows.mockImplementation(realCascade.deleteUserDocRows);

const {
	appendSongNotes,
	chartExamples,
	claimSongNotes,
	createUserDoc,
	deleteUserDoc,
	docVersionById,
	finishSongNotes,
	getUserDoc,
	getUserNote,
	listDocVersions,
	listUserDocs,
	logAiRequest,
	releaseSongNotes,
	saveSongDoc,
	saveUserDoc,
	saveUserNote,
	setProjectNoAi,
	setSongFinished,
	setSongNoAi,
	songNotesFor,
	updateUserDocMeta,
	userNoteSongIds,
} = await import("./data");

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const at = (ms: number) => new Date(ms);
const row = (table: Parameters<typeof fake.rows>[0], id: string) =>
	fake.rows(table).find((r) => r.id === id);
const LONG = "x".repeat(300);

const song = (id: string, extra: Record<string, unknown> = {}) => ({
	id,
	accountId: "a1",
	projectId: "p1",
	title: id,
	slug: id,
	status: "active",
	chartMarkdown: "",
	chartHash: null,
	chartVersion: 0,
	lyricsMarkdown: "",
	lyricsHash: null,
	lyricsVersion: 0,
	notesMarkdown: "",
	notesHash: null,
	notesVersion: 0,
	sections: [],
	changes: [],
	noAi: false,
	isFinished: false,
	notesJson: null,
	notesKey: null,
	notesDoneSeconds: 0,
	notesStartedAt: null,
	...extra,
});
/** A shared "notes" revision of song sg1, or a private one when `userId` is given. */
const version = (id: string, versionNumber: number, extra: Record<string, unknown> = {}) => ({
	id,
	songId: "sg1",
	kind: "notes",
	userId: null,
	versionNumber,
	markdown: `v${versionNumber}`,
	contentHash: `h${versionNumber}`,
	createdBy: "u1",
	createdAt: at(NOW + versionNumber),
	...extra,
});
const doc = (id: string, extra: Record<string, unknown> = {}) => ({
	id,
	slug: id,
	kind: "doc",
	title: id,
	sortOrder: 0,
	markdown: "",
	publishedAt: null,
	contentHash: null,
	version: 0,
	updatedBy: "u1",
	...extra,
});
const users = [{ id: "u1", name: "Ann", email: "ann@example.com" }];
const note = (pitch: number): Note => ({ pitch, start: 0, duration: 1 }) as unknown as Note;

beforeAll(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => reset());

describe("saveSongDoc", () => {
	test("a changed text is a new version: the row updated, a revision written with its hash", async () => {
		reset({ song: [song("sg1", { notesMarkdown: "old", notesHash: "h-old", notesVersion: 4 })] });
		expect(await saveSongDoc("a1", "u1", "sg1", "notes", "line one\r\nline two")).toEqual({
			ok: true,
			version: 5,
			changed: true,
		});
		const hash = await hashMarkdown("line one\nline two");
		expect(row("song", "sg1")).toMatchObject({
			notesMarkdown: "line one\nline two",
			notesHash: hash,
			notesVersion: 5,
		});
		expect(fake.rows("songDocVersion")).toHaveLength(1);
		expect(fake.rows("songDocVersion")[0]).toMatchObject({
			songId: "sg1",
			kind: "notes",
			userId: null,
			versionNumber: 5,
			markdown: "line one\nline two",
			contentHash: hash,
			createdBy: "u1",
		});
	});
	test("the same text again writes nothing; another account's song is not found", async () => {
		const hash = await hashMarkdown("same");
		reset({
			song: [
				song("sg1", { chartMarkdown: "same", chartHash: hash, chartVersion: 2 }),
				song("sg2", { accountId: "a2" }),
			],
		});
		expect(await saveSongDoc("a1", "u1", "sg1", "chart", "same")).toEqual({
			ok: true,
			version: 2,
			changed: false,
		});
		expect(await saveSongDoc("a1", "u1", "sg2", "chart", "x")).toEqual({
			ok: false,
			error: "Song not found.",
		});
		expect(callsTo("insert", "song_doc_version")).toEqual([]);
		expect(callsTo("update", "song")).toEqual([]);
	});
	test("emptying a long document needs confirmation", async () => {
		reset({ song: [song("sg1", { lyricsMarkdown: LONG, lyricsHash: "h", lyricsVersion: 1 })] });
		expect(await saveSongDoc("a1", "u1", "sg1", "lyrics", "  ")).toMatchObject({
			ok: false,
			needsConfirm: true,
		});
		expect(await saveSongDoc("a1", "u1", "sg1", "lyrics", "", { confirmEmpty: true })).toEqual({
			ok: true,
			version: 2,
			changed: true,
		});
		expect(row("song", "sg1")?.lyricsMarkdown).toBe("");
	});
	test("ten revisions are kept per document: the oldest goes, a private note's and another kind's stay", async () => {
		reset({
			song: [song("sg1", { notesVersion: 10 })],
			songDocVersion: [
				...Array.from({ length: 10 }, (_, i) => version(`v${i + 1}`, i + 1)),
				version("mine", 1, { kind: "mynotes", userId: "u1" }),
				version("chart", 1, { kind: "chart" }),
			],
		});
		await saveSongDoc("a1", "u1", "sg1", "notes", "eleven");
		const ids = fake.rows("songDocVersion").map((r) => r.id);
		expect(ids).not.toContain("v1");
		expect(ids).toEqual(expect.arrayContaining(["v2", "v10", "mine", "chart"]));
		expect(
			fake.rows("songDocVersion").filter((r) => r.kind === "notes" && r.userId === null),
		).toHaveLength(10);
	});
});

describe("listDocVersions / docVersionById", () => {
	test("a document's revisions newest first with their author, never another scope's", async () => {
		reset({
			user: users,
			songDocVersion: [
				version("v1", 1),
				version("v2", 2, { createdBy: null }),
				version("mine", 3, { kind: "mynotes", userId: "u1" }),
				version("other", 4, { songId: "sg2" }),
				version("chart", 5, { kind: "chart" }),
			],
		});
		expect(await listDocVersions("sg1", "notes", null)).toEqual([
			{ id: "v2", versionNumber: 2, markdown: "v2", createdAt: NOW + 2, createdBy: null },
			{
				id: "v1",
				versionNumber: 1,
				markdown: "v1",
				createdAt: NOW + 1,
				createdBy: { name: "Ann" },
			},
		]);
		expect((await listDocVersions("sg1", "mynotes", "u1")).map((v) => v.id)).toEqual(["mine"]);
		expect(await listDocVersions("sg1", "mynotes", "u2")).toEqual([]);
		expect(await docVersionById("sg1", "notes", null, "v1")).toEqual({
			id: "v1",
			versionNumber: 1,
			markdown: "v1",
		});
		expect(await docVersionById("sg1", "notes", null, "mine")).toBeNull();
		expect(await docVersionById("sg1", "mynotes", "u1", "mine")).toMatchObject({ id: "mine" });
	});
});

describe("private notes", () => {
	const mine = {
		id: "n1",
		accountId: "a1",
		songId: "sg1",
		userId: "u1",
		markdown: "my note",
		html: "<p>my note</p>",
		version: 3,
	};
	test("userNoteSongIds and getUserNote see one person's notes only", async () => {
		reset({
			songUserNote: [
				mine,
				{ ...mine, id: "n2", songId: "sg2", userId: "u2" },
				{ ...mine, id: "n3", songId: "sg3" },
			],
		});
		expect(await userNoteSongIds("u1", ["sg1", "sg2", "sg3", "sg4"])).toEqual(
			new Set(["sg1", "sg3"]),
		);
		expect(await userNoteSongIds("u1", [])).toEqual(new Set());
		expect(await getUserNote("sg1", "u1")).toEqual({
			markdown: "my note",
			html: "<p>my note</p>",
			version: 3,
		});
		expect(await getUserNote("sg2", "u1")).toBeNull();
	});
	test("the first save creates the note with its HTML and a private revision; a change bumps it", async () => {
		reset({ song: [song("sg1")] });
		expect(await saveUserNote("sg1", "u1", "a1", "# Hi")).toEqual({
			ok: true,
			version: 1,
			changed: true,
			html: renderMarkdown("# Hi"),
		});
		expect(callsTo("insert", "song_user_note")[0].values).toEqual({
			accountId: "a1",
			songId: "sg1",
			userId: "u1",
			markdown: "# Hi",
			html: renderMarkdown("# Hi"),
			version: 1,
		});
		expect(fake.rows("songDocVersion")[0]).toMatchObject({
			songId: "sg1",
			kind: "mynotes",
			userId: "u1",
			versionNumber: 1,
			markdown: "# Hi",
			contentHash: await hashMarkdown("# Hi"),
			createdBy: "u1",
		});
		expect(await saveUserNote("sg1", "u1", "a1", "# Hi again")).toMatchObject({
			ok: true,
			version: 2,
			changed: true,
		});
		expect(fake.rows("songDocVersion").map((v) => v.versionNumber)).toEqual([1, 2]);
	});
	test("the same text stays on its version; a stale expected version, a strange song and a long wipe are refused", async () => {
		reset({ song: [song("sg1")], songUserNote: [{ ...mine, markdown: LONG }] });
		expect(await saveUserNote("sg1", "u1", "a1", LONG)).toEqual({
			ok: true,
			version: 3,
			changed: false,
			html: "<p>my note</p>",
		});
		expect(await saveUserNote("sg1", "u1", "a1", "new", 2)).toMatchObject({
			ok: false,
			error: expect.stringContaining("changed elsewhere"),
		});
		expect(await saveUserNote("sg1", "u1", "a2", "new")).toEqual({
			ok: false,
			error: "Song not found.",
		});
		expect(await saveUserNote("sg1", "u1", "a1", "", 3)).toMatchObject({
			ok: false,
			needsConfirm: true,
		});
		expect(callsTo("insert", "song_user_note")).toEqual([]);
		expect(await saveUserNote("sg1", "u1", "a1", "", 3, { confirmEmpty: true })).toMatchObject({
			ok: true,
			version: 4,
			changed: true,
			html: "",
		});
	});
});

describe("user docs", () => {
	test("createUserDoc slugs the title, stepping past a taken one; a blank title takes the kind", async () => {
		reset({ userDoc: [doc("about")] });
		expect(await createUserDoc("u1", "About")).toMatchObject({
			slug: "about-2",
			title: "About",
			kind: "doc",
			updatedBy: "u1",
		});
		expect(await createUserDoc("u1", "!!!", "post")).toMatchObject({ slug: "post", kind: "post" });
		expect(fake.rows("userDoc")).toHaveLength(3);
	});
	test("updateUserDocMeta renames and reorders; a post's publish date is set once and cleared on unpublishing", async () => {
		reset({
			userDoc: [doc("d1"), doc("d2"), doc("p1", { kind: "post", publishedAt: at(NOW - 1) })],
		});
		expect(await updateUserDocMeta("d1", { title: "T", slug: "d2", sortOrder: 1 })).toEqual({
			ok: false,
			error: "Another page has that address.",
		});
		expect(await updateUserDocMeta("nope", { title: "T", slug: "x", sortOrder: 1 })).toEqual({
			ok: false,
			error: "Page not found.",
		});
		expect(
			await updateUserDocMeta("d1", { title: "T", slug: "d1", sortOrder: 2, published: true }),
		).toMatchObject({ ok: true, doc: { title: "T", sortOrder: 2, publishedAt: null } });
		expect(
			await updateUserDocMeta("p1", { title: "P", slug: "p1", sortOrder: 0, published: true }),
		).toMatchObject({ ok: true, doc: { publishedAt: at(NOW - 1) } });
		expect(
			await updateUserDocMeta("p1", { title: "P", slug: "p1", sortOrder: 0, published: false }),
		).toMatchObject({ ok: true, doc: { publishedAt: null } });
		expect(
			await updateUserDocMeta("p1", { title: "P", slug: "p1", sortOrder: 0, published: true }),
		).toMatchObject({ ok: true, doc: { publishedAt: at(NOW) } });
	});
	test("deleteUserDoc removes the page and its versions and says what it was", async () => {
		reset({
			userDoc: [doc("d1"), doc("p1", { kind: "post" })],
			userDocVersion: [
				{ id: "x", docId: "d1", versionNumber: 1, markdown: "", contentHash: "" },
				{ id: "y", docId: "p1", versionNumber: 1, markdown: "", contentHash: "" },
			],
		});
		expect(await deleteUserDoc("nope")).toBeNull();
		expect(await deleteUserDoc("p1")).toEqual({ id: "p1", kind: "post" });
		expect(fake.rows("userDoc").map((r) => r.id)).toEqual(["d1"]);
		expect(fake.rows("userDocVersion").map((r) => r.id)).toEqual(["x"]);
	});
	test("saveUserDoc versions like a song document and keeps ten", async () => {
		reset({
			userDoc: [
				doc("d1", { markdown: "v10", contentHash: await hashMarkdown("v10"), version: 10 }),
				doc("d2", { markdown: LONG, contentHash: "hl" }),
			],
			userDocVersion: Array.from({ length: 10 }, (_, i) => ({
				id: `v${i + 1}`,
				docId: "d1",
				versionNumber: i + 1,
				markdown: "",
				contentHash: "",
			})),
		});
		expect(await saveUserDoc("nope", "u1", "x")).toEqual({ ok: false, error: "Page not found." });
		expect(await saveUserDoc("d2", "u1", "")).toMatchObject({ ok: false, needsConfirm: true });
		expect(await saveUserDoc("d1", "u1", "v10")).toEqual({ ok: true, version: 10, changed: false });
		expect(await saveUserDoc("d1", "u1", "v11\r\n")).toEqual({
			ok: true,
			version: 11,
			changed: true,
		});
		expect(row("userDoc", "d1")).toMatchObject({
			markdown: "v11\n",
			contentHash: await hashMarkdown("v11\n"),
			version: 11,
			updatedBy: "u1",
		});
		const ids = fake.rows("userDocVersion").map((r) => r.id);
		expect(ids).toHaveLength(10);
		expect(ids).not.toContain("v1");
		expect(fake.rows("userDocVersion").find((r) => r.versionNumber === 11)).toMatchObject({
			docId: "d1",
			markdown: "v11\n",
			createdBy: "u1",
		});
	});
	test("listUserDocs is the reading order of the pages, without the releases page or the posts; getUserDoc names its editor", async () => {
		reset({
			user: users,
			userDoc: [
				doc("b", { sortOrder: 1 }),
				doc("a", { sortOrder: 1 }),
				doc("c", { sortOrder: 0 }),
				doc(RELEASES_DOC_SLUG, { sortOrder: 0 }),
				doc("p", { kind: "post" }),
			],
		});
		expect((await listUserDocs()).map((d) => d.slug)).toEqual(["c", "a", "b"]);
		expect(Object.keys((await listUserDocs())[0]).sort()).toEqual([
			"id",
			"slug",
			"sortOrder",
			"title",
			"updatedAt",
			"version",
		]);
		expect(await getUserDoc("a")).toMatchObject({ id: "a", editor: { name: "Ann" } });
		expect(await getUserDoc("zzz")).toBeUndefined();
	});
});

describe("chartExamples", () => {
	test("two other active songs of the account with a real chart and sections, charts cut to 3000 characters", async () => {
		const chart = "c".repeat(3500);
		const sections = [{ name: "Verse", bars: 8 }];
		reset({
			song: [
				song("me", { chartMarkdown: chart, sections }),
				song("short", { chartMarkdown: "a".repeat(80), sections }),
				song("no-sections", { chartMarkdown: chart }),
				song("archived", { chartMarkdown: chart, sections, status: "archived" }),
				song("theirs", { chartMarkdown: chart, sections, accountId: "a2" }),
				song("one", { chartMarkdown: chart, sections, changes: [{ at: 1 }] }),
				song("two", { chartMarkdown: chart, sections }),
				song("three", { chartMarkdown: chart, sections }),
			],
		});
		const examples = await chartExamples("a1", "me");
		expect(examples.map((e) => e.title)).toEqual(["one", "two"]);
		expect(examples[0]).toEqual({
			title: "one",
			sections,
			changes: [{ at: 1 }],
			chart: "c".repeat(3000),
		});
	});
});

describe("transcribed notes", () => {
	test("claimSongNotes takes an idle or stale song, wiping on a fresh start; a live claim is refused", async () => {
		reset({
			song: [
				song("sg1", { notesJson: [note(60)], notesDoneSeconds: 8 }),
				song("sg2", { notesStartedAt: at(NOW - NOTES_STALE_MS + 1000) }),
				song("sg3", {
					notesStartedAt: at(NOW - NOTES_STALE_MS - 1000),
					notesJson: [note(1)],
					notesDoneSeconds: 2,
				}),
			],
		});
		expect(await claimSongNotes("sg1", "k1", true)).toBe(true);
		expect(row("song", "sg1")).toMatchObject({
			notesStartedAt: at(NOW),
			notesKey: "k1",
			notesJson: [],
			notesDoneSeconds: 0,
		});
		expect(await claimSongNotes("sg1", "k1", false)).toBe(false);
		expect(await claimSongNotes("sg2", "k2", false)).toBe(false);
		expect(await claimSongNotes("sg3", "k3", false)).toBe(true);
		expect(row("song", "sg3")).toMatchObject({
			notesKey: "k3",
			notesJson: [note(1)],
			notesDoneSeconds: 2,
		});
	});
	test("appendSongNotes adds to the notes and moves the progress; finishing or releasing clears the claim", async () => {
		reset({
			song: [song("sg1", { notesJson: [note(60)], notesDoneSeconds: 4, notesStartedAt: at(NOW) })],
		});
		await appendSongNotes("sg1", [note(62), note(64)], 8);
		expect(row("song", "sg1")).toMatchObject({
			notesJson: [note(60), note(62), note(64)],
			notesDoneSeconds: 8,
		});
		await appendSongNotes("nope", [note(1)], 1);
		await finishSongNotes("sg1");
		expect(row("song", "sg1")?.notesStartedAt).toBeNull();
		await claimSongNotes("sg1", "k", false);
		await releaseSongNotes("sg1");
		expect(row("song", "sg1")?.notesStartedAt).toBeNull();
	});
	test("appendSongNotes gives up when another writer keeps moving the progress", async () => {
		reset({
			song: {
				rows: [song("sg1", { notesJson: [], notesDoneSeconds: 10 })],
				findFirst: async () => ({ notesJson: [], notesDoneSeconds: 5 }),
			},
		});
		await expect(appendSongNotes("sg1", [note(1)], 6)).rejects.toThrow("another writer");
		expect(callsTo("update", "song")).toHaveLength(3);
		expect(row("song", "sg1")?.notesDoneSeconds).toBe(10);
	});
	test("songNotesFor: the notes with whether they cover the ready stems; null for another account", async () => {
		reset({
			song: [
				song("sg1", { notesJson: [note(60)], notesKey: "k", notesDoneSeconds: 12 }),
				song("sg2", { notesJson: null, notesKey: null, notesDoneSeconds: 0 }),
			],
			stem: [
				{
					id: "s1",
					accountId: "a1",
					songId: "sg1",
					status: "ready",
					url: "https://b/s1",
					durationSeconds: 12,
				},
				{
					id: "s2",
					accountId: "a1",
					songId: "sg1",
					status: "ready",
					url: "https://b/s2",
					durationSeconds: 20,
					playbackStatus: null,
				},
				{
					id: "s3",
					accountId: "a1",
					songId: "sg1",
					status: "uploading",
					url: "",
					durationSeconds: 99,
				},
			],
		});
		expect(await songNotesFor("a1", "sg1")).toEqual({
			notes: [note(60)],
			doneSeconds: 12,
			duration: 20,
			complete: false,
		});
		expect(await songNotesFor("a1", "sg2")).toEqual({
			notes: [],
			doneSeconds: 0,
			duration: 0,
			complete: false,
		});
		expect(await songNotesFor("a2", "sg1")).toBeNull();
		await appendSongNotes("sg1", [], 20);
		expect((await songNotesFor("a1", "sg1"))?.complete).toBe(true);
	});
});

describe("flags and the AI log", () => {
	test("setProjectNoAi, setSongNoAi and setSongFinished are scoped to the account", async () => {
		reset({ project: [{ id: "p1", accountId: "a1", noAi: false }], song: [song("sg1")] });
		expect(await setProjectNoAi("a1", "p1", true)).toBe(true);
		expect(await setProjectNoAi("a2", "p1", false)).toBe(false);
		expect(row("project", "p1")?.noAi).toBe(true);
		expect(await setSongNoAi("a1", "sg1", true)).toBe(true);
		expect(await setSongFinished("a1", "sg1", true)).toBe(true);
		expect(row("song", "sg1")).toMatchObject({ noAi: true, isFinished: true });
		expect(await setSongNoAi("a2", "sg1", false)).toBe(false);
		expect(await setSongFinished("a2", "sg1", false)).toBe(false);
		expect(row("song", "sg1")).toMatchObject({ noAi: true, isFinished: true });
	});
	test("logAiRequest writes the entry as given", async () => {
		const entry: Parameters<typeof logAiRequest>[0] = {
			kind: "chart",
			model: "m",
			userId: "u1",
			songId: "sg1",
			prompt: "Draft a chart",
			response: "{}",
			parsed: { ok: true },
			error: null,
			durationMs: 5,
			inputTokens: 10,
			outputTokens: 20,
		};
		await logAiRequest(entry);
		expect(callsTo("insert", "ai_request")[0].values).toEqual(entry);
		expect(fake.rows("aiRequest")[0]).toMatchObject(entry);
	});
});
