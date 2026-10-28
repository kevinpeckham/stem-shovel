import { beforeEach, describe, expect, test } from "vite-plus/test";
import { MAX_SET_LIST_ITEMS, MAX_SET_LISTS_PER_ACCOUNT } from "#lib/val/SetListSchema.js";
import { callsTo, cascade, fake, reset } from "../../../tests/helpers/fakeDataLayer";

const {
	accountSongChoices,
	addSetListItem,
	createSetList,
	createShareLink,
	deleteSetList,
	deleteSetListItem,
	duplicateSetList,
	listSetLists,
	listShareLinks,
	openShareLinks,
	reorderSetListItems,
	setListPage,
	setListSongDocs,
	shareLinkTarget,
	updateSetList,
	updateSetListItem,
} = await import("./data");

const A = "acct-one____________";
const B = "acct-two____________";
const U = "user-one____________";
const at = (iso: string) => new Date(iso);

const account = (id: string, slug: string) => ({ id, slug, name: slug });
const project = (id: string, accountId: string, over: Record<string, unknown> = {}) => ({
	id,
	accountId,
	name: `Project ${id}`,
	slug: id,
	status: "active",
	isPrivate: false,
	isRestricted: false,
	...over,
});
const song = (
	id: string,
	accountId: string,
	projectId: string,
	over: Record<string, unknown> = {},
) => ({
	id,
	accountId,
	projectId,
	title: `Song ${id}`,
	slug: id,
	status: "active",
	isPrivate: false,
	chartMarkdown: "",
	lyricsMarkdown: "",
	...over,
});
const list = (id: string, accountId: string, over: Record<string, unknown> = {}) => ({
	id,
	accountId,
	title: `List ${id}`,
	notes: "",
	createdBy: U,
	createdAt: at("2026-10-01T00:00:00Z"),
	updatedAt: at("2026-10-01T00:00:00Z"),
	...over,
});
const item = (id: string, setListId: string, over: Record<string, unknown> = {}) => ({
	id,
	setListId,
	songId: null,
	title: `Row ${id}`,
	note: "",
	sortOrder: 0,
	createdAt: at("2026-10-01T00:00:00Z"),
	...over,
});

describe("listSetLists", () => {
	test("the account's set lists, last updated first, with their row counts and maker", async () => {
		reset({
			user: [{ id: U, name: "Ann" }],
			setList: [
				list("l1", A, { updatedAt: at("2026-10-02T00:00:00Z") }),
				list("l2", A, { updatedAt: at("2026-10-05T00:00:00Z"), createdBy: null }),
				list("l3", B, { updatedAt: at("2026-10-09T00:00:00Z") }),
			],
			setListItem: [item("i1", "l1"), item("i2", "l1", { sortOrder: 1 }), item("i3", "l3")],
		});
		const rows = await listSetLists(A);
		expect(rows.map((r) => [r.id, r.itemCount, r.creator])).toEqual([
			["l2", 0, null],
			["l1", 2, { name: "Ann" }],
		]);
		expect(rows[1]).toEqual({
			id: "l1",
			title: "List l1",
			notes: "",
			createdAt: at("2026-10-01T00:00:00Z"),
			updatedAt: at("2026-10-02T00:00:00Z"),
			itemCount: 2,
			creator: { name: "Ann" },
		});
	});
});

describe("setListPage", () => {
	beforeEach(() =>
		reset({
			project: [project("p1", A, { isRestricted: true }), project("p2", A, { status: "archived" })],
			song: [
				song("s1", A, "p1", { title: "Now Called", chartMarkdown: "| C |", isPrivate: true }),
				song("s2", A, "p1", { status: "archived" }),
				song("s3", A, "p2"),
				song("s4", B, "p1"),
			],
			setList: [list("l1", A), list("l2", B)],
			setListItem: [
				item("i1", "l1", { songId: "s1", title: "Was Called", sortOrder: 1, note: "in G" }),
				item("i2", "l1", { title: "Break", sortOrder: 0, createdAt: at("2026-10-02T00:00:00Z") }),
				item("i3", "l1", {
					title: "Tune down",
					sortOrder: 0,
					createdAt: at("2026-10-01T00:00:00Z"),
				}),
				item("i4", "l1", { songId: "s2", title: "Archived Song", sortOrder: 2 }),
				item("i5", "l1", { songId: "s3", title: "In Archived Project", sortOrder: 3 }),
				item("i6", "l1", { songId: "s4", title: "Someone Else's", sortOrder: 4 }),
				item("i7", "l2", { title: "Other" }),
			],
		}),
	);
	test("another account's set list is not found", async () => {
		expect(await setListPage(A, "l2")).toBeNull();
		expect(await setListPage(B, "l1")).toBeNull();
	});
	test("rows by sort order then creation; a live song's facts and current title", async () => {
		const page = await setListPage(A, "l1");
		expect(page?.setList).toEqual({
			id: "l1",
			accountId: A,
			title: "List l1",
			notes: "",
			createdAt: at("2026-10-01T00:00:00Z"),
			updatedAt: at("2026-10-01T00:00:00Z"),
			createdBy: U,
		});
		expect(page?.items.map((r) => r.id)).toEqual(["i3", "i2", "i1", "i4", "i5", "i6"]);
		expect(page?.items[2]).toEqual({
			id: "i1",
			songId: "s1",
			title: "Now Called",
			note: "in G",
			sortOrder: 1,
			song: {
				id: "s1",
				slug: "s1",
				title: "Now Called",
				isPrivate: true,
				projectId: "p1",
				project: { slug: "p1", name: "Project p1", isPrivate: false, isRestricted: true },
				hasChart: true,
				hasLyrics: false,
			},
		});
	});
	test("an archived song, a song of an archived project, or another account's song reads as its stored title", async () => {
		const page = await setListPage(A, "l1");
		expect(page?.items.slice(3).map((r) => [r.title, r.song])).toEqual([
			["Archived Song", null],
			["In Archived Project", null],
			["Someone Else's", null],
		]);
		expect(page?.items[1]).toMatchObject({ songId: null, title: "Break", song: null });
	});
});

describe("createSetList, updateSetList, deleteSetList", () => {
	test("a new set list, made by the user", async () => {
		reset({});
		const row = await createSetList(A, U, { title: "Spring tour", notes: "Capo 2" });
		expect(row).toMatchObject({
			accountId: A,
			title: "Spring tour",
			notes: "Capo 2",
			createdBy: U,
		});
		expect(fake.rows("setList")).toHaveLength(1);
	});
	test("null at the account's cap; another account's lists do not count", async () => {
		reset({
			setList: Array.from({ length: MAX_SET_LISTS_PER_ACCOUNT }, (_, i) => list(`l${i}`, A)),
		});
		expect(await createSetList(A, U, { title: "One more", notes: "" })).toBeNull();
		expect(await createSetList(B, U, { title: "Theirs", notes: "" })).toMatchObject({
			accountId: B,
		});
	});
	test("update is scoped to the account", async () => {
		reset({ setList: [list("l1", A)] });
		expect(await updateSetList(B, "l1", { title: "X", notes: "" })).toBeNull();
		expect(await updateSetList(A, "l1", { title: "Acoustic", notes: "Quiet" })).toMatchObject({
			id: "l1",
			title: "Acoustic",
			notes: "Quiet",
		});
	});
	test("delete hands the set list to the cascade, only for its own account", async () => {
		reset({ setList: [list("l1", A)] });
		expect(await deleteSetList(B, "l1")).toBe(false);
		expect(cascade.deleteSetListRows).not.toHaveBeenCalled();
		expect(await deleteSetList(A, "l1")).toBe(true);
		expect(cascade.deleteSetListRows).toHaveBeenCalledWith(["l1"]);
	});
});

describe("addSetListItem", () => {
	beforeEach(() =>
		reset({
			project: [project("p1", A), project("p2", A, { status: "archived" }), project("p9", B)],
			song: [
				song("s1", A, "p1", { title: "Real Title", lyricsMarkdown: "la la" }),
				song("s2", A, "p2"),
				song("s3", A, "p1", { status: "archived" }),
				song("s9", B, "p9"),
			],
			setList: [list("l1", A), list("l2", B)],
			setListItem: [item("i1", "l1", { sortOrder: 4 })],
		}),
	);
	test("a song row stores the song's title, goes last and touches the set list", async () => {
		const row = await addSetListItem(A, "l1", { songId: "s1", title: "", note: "count in: Bo" });
		expect(row).toMatchObject({
			songId: "s1",
			title: "Real Title",
			note: "count in: Bo",
			sortOrder: 5,
			song: { id: "s1", hasLyrics: true, hasChart: false },
		});
		expect(fake.rows("setListItem").at(-1)).toMatchObject({ title: "Real Title", sortOrder: 5 });
		expect(callsTo("update", "set_list")).toHaveLength(1);
	});
	test("a free-text row keeps its own title; the first row of an empty list is 0", async () => {
		reset({ setList: [list("l1", A)] });
		expect(await addSetListItem(A, "l1", { songId: null, title: "Break", note: "" })).toEqual({
			id: expect.any(String),
			songId: null,
			title: "Break",
			note: "",
			sortOrder: 0,
			song: null,
		});
	});
	test("null for another account's set list, or a song that is not the account's active song", async () => {
		expect(await addSetListItem(A, "l2", { songId: null, title: "X", note: "" })).toBeNull();
		for (const songId of ["s2", "s3", "s9", "nope"])
			expect(await addSetListItem(A, "l1", { songId, title: "", note: "" })).toBeNull();
		expect(fake.rows("setListItem")).toHaveLength(1);
	});
	test('"full" at the cap', async () => {
		reset({
			setList: [list("l1", A)],
			setListItem: Array.from({ length: MAX_SET_LIST_ITEMS }, (_, i) =>
				item(`i${i}`, "l1", { sortOrder: i }),
			),
		});
		expect(await addSetListItem(A, "l1", { songId: null, title: "More", note: "" })).toBe("full");
	});
});

describe("updateSetListItem, deleteSetListItem", () => {
	beforeEach(() =>
		reset({
			project: [project("p1", A)],
			song: [song("s1", A, "p1", { title: "Song Title" })],
			setList: [list("l1", A), list("l2", B)],
			setListItem: [
				item("i1", "l1", { songId: "s1", title: "Song Title" }),
				item("i2", "l1", { title: "Break" }),
				item("i3", "l2", { title: "Theirs" }),
			],
		}),
	);
	test("a song row changes only its note", async () => {
		expect(await updateSetListItem(A, "i1", { title: "Renamed", note: "segue" })).toMatchObject({
			title: "Song Title",
			note: "segue",
		});
		expect(fake.rows("setListItem")[0]).toMatchObject({ title: "Song Title", note: "segue" });
	});
	test("a free-text row changes its title and note; an empty title keeps the old one", async () => {
		expect(await updateSetListItem(A, "i2", { title: "Encore", note: "x" })).toMatchObject({
			title: "Encore",
			note: "x",
		});
		expect(await updateSetListItem(A, "i2", { title: "", note: "y" })).toMatchObject({
			title: "Encore",
			note: "y",
		});
		expect(callsTo("update", "set_list")).toHaveLength(2);
	});
	test("another account's row is not found", async () => {
		expect(await updateSetListItem(A, "i3", { title: "Mine", note: "" })).toBeNull();
		expect(await deleteSetListItem(A, "i3")).toBe(false);
		expect(fake.rows("setListItem").map((r) => r.id)).toEqual(["i1", "i2", "i3"]);
	});
	test("delete removes the row and touches the set list", async () => {
		expect(await deleteSetListItem(A, "i2")).toBe(true);
		expect(fake.rows("setListItem").map((r) => r.id)).toEqual(["i1", "i3"]);
		expect(callsTo("update", "set_list")).toHaveLength(1);
	});
});

describe("reorderSetListItems", () => {
	beforeEach(() =>
		reset({
			setList: [list("l1", A), list("l2", B)],
			setListItem: [
				item("i1", "l1", { sortOrder: 0 }),
				item("i2", "l1", { sortOrder: 1 }),
				item("i3", "l1", { sortOrder: 2 }),
				item("i9", "l2", { sortOrder: 0 }),
			],
		}),
	);
	const order = () =>
		fake
			.rows("setListItem")
			.filter((r) => r.setListId === "l1")
			.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
			.map((r) => r.id);
	test("the rows take the order given; only the moved ones are written", async () => {
		expect(await reorderSetListItems(A, "l1", ["i3", "i1", "i2"])).toBe(true);
		expect(order()).toEqual(["i3", "i1", "i2"]);
		expect(callsTo("update", "set_list_item")).toHaveLength(3);
		expect(callsTo("update", "set_list")).toHaveLength(1);
	});
	test("false unless the ids are exactly the list's rows, once each", async () => {
		for (const ids of [
			["i1", "i2"],
			["i1", "i2", "i3", "i9"],
			["i1", "i2", "i9"],
			["i1", "i1", "i2"],
		])
			expect(await reorderSetListItems(A, "l1", ids)).toBe(false);
		expect(order()).toEqual(["i1", "i2", "i3"]);
	});
	test("another account's set list is not found", async () => {
		expect(await reorderSetListItems(B, "l1", ["i3", "i1", "i2"])).toBe(false);
		expect(order()).toEqual(["i1", "i2", "i3"]);
	});
});

describe("accountSongChoices", () => {
	test("the account's active songs in active projects, by title, with what canViewSong reads", async () => {
		reset({
			project: [
				project("p1", A, { isPrivate: true }),
				project("p2", A, { status: "archived" }),
				project("p9", B),
			],
			song: [
				song("s1", A, "p1", { title: "Zebra" }),
				song("s2", A, "p1", { title: "Apple", isPrivate: true }),
				song("s3", A, "p1", { title: "Gone", status: "archived" }),
				song("s4", A, "p2", { title: "Shelved" }),
				song("s9", B, "p9", { title: "Theirs" }),
			],
		});
		expect(await accountSongChoices(A)).toEqual([
			{
				id: "s2",
				title: "Apple",
				isPrivate: true,
				projectId: "p1",
				project: { name: "Project p1", slug: "p1", isPrivate: true, isRestricted: false },
			},
			{
				id: "s1",
				title: "Zebra",
				isPrivate: false,
				projectId: "p1",
				project: { name: "Project p1", slug: "p1", isPrivate: true, isRestricted: false },
			},
		]);
	});
});

describe("share links for a set list", () => {
	test("made, listed, opened and resolved to the show view", async () => {
		reset({ account: [account(A, "band")], setList: [list("l1", A)] });
		const link = await createShareLink(
			A,
			U,
			{ setListId: "l1" },
			{ note: "", maxUses: null, expiresDays: 0 },
		);
		expect(link).toMatchObject({ setListId: "l1", songId: null, sessionId: null });
		expect((await listShareLinks({ setListId: "l1" })).map((l) => [l.id, l.state])).toEqual([
			[link.id, "open"],
		]);
		expect(await listShareLinks({ setListId: "l2" })).toEqual([]);
		expect(await openShareLinks([link.code])).toEqual([
			expect.objectContaining({ code: link.code, setListId: "l1", songId: null }),
		]);
		expect(await shareLinkTarget(link.code)).toBe("/band/set-lists/l1/show");
	});
	test("a code for a set list that is gone resolves to nothing", async () => {
		reset({
			account: [account(A, "band")],
			shareLink: [{ id: "sh1", accountId: A, setListId: "gone", code: "CODE1" }],
		});
		expect(await shareLinkTarget("CODE1")).toBeNull();
	});
});

describe("duplicateSetList", () => {
	beforeEach(() =>
		reset({
			setList: [list("l1", A, { title: "Spring tour", notes: "Capo 2" }), list("l2", B)],
			setListItem: [
				item("i1", "l1", { songId: "s1", title: "Song One", note: "in G", sortOrder: 5 }),
				item("i2", "l1", { title: "Break", sortOrder: 2 }),
				item("i9", "l2", { title: "Theirs" }),
			],
		}),
	);
	test("a new set list with the title marked a copy, the notes and every row in order", async () => {
		const copy = await duplicateSetList(A, "l1", "user-two____________");
		expect(copy).toMatchObject({
			accountId: A,
			title: "Spring tour (copy)",
			notes: "Capo 2",
			createdBy: "user-two____________",
		});
		const rows = fake.rows("setListItem").filter((r) => r.setListId === copy!.id);
		expect(rows.map((r) => [r.songId, r.title, r.note, r.sortOrder])).toEqual([
			[null, "Break", "", 0],
			["s1", "Song One", "in G", 1],
		]);
		expect(fake.rows("setListItem").filter((r) => r.setListId === "l1")).toHaveLength(2);
	});
	test("an empty set list copies with no rows", async () => {
		reset({ setList: [list("l1", A)] });
		const copy = await duplicateSetList(A, "l1", U);
		expect(copy).toMatchObject({ title: "List l1 (copy)" });
		expect(callsTo("insert", "set_list_item")).toHaveLength(0);
	});
	test("null for another account's set list, or at the account's cap", async () => {
		expect(await duplicateSetList(B, "l1", U)).toBeNull();
		reset({
			setList: Array.from({ length: MAX_SET_LISTS_PER_ACCOUNT }, (_, i) => list(`l${i}`, A)),
		});
		expect(await duplicateSetList(A, "l0", U)).toBeNull();
		expect(fake.rows("setList")).toHaveLength(MAX_SET_LISTS_PER_ACCOUNT);
	});
});

describe("setListSongDocs", () => {
	test("the chart and lyrics of the account's songs asked for", async () => {
		reset({
			project: [project("p1", A), project("p9", B)],
			song: [
				song("s1", A, "p1", { chartMarkdown: "| C |", lyricsMarkdown: "la" }),
				song("s2", A, "p1"),
				song("s9", B, "p9", { chartMarkdown: "theirs" }),
			],
		});
		expect(await setListSongDocs(A, ["s1", "s9"])).toEqual([
			{ id: "s1", chartMarkdown: "| C |", lyricsMarkdown: "la" },
		]);
		expect(await setListSongDocs(A, [])).toEqual([]);
	});
});
