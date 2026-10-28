import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	call,
	fakeId,
	httpError,
	redirected,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Authorization of the set list remote functions (docs/band-plan.md): an editor of the set list's account. */
const setLists = await import("./setLists.remote");

const LIST = fakeId("list-one");
const OTHER_LIST = fakeId("list-two");
const ITEM = fakeId("item-one");
const OTHER_ITEM = fakeId("item-two");
const SONG = fakeId("song-one");
const ROW = {
	id: ITEM,
	songId: null,
	title: "Break",
	customTitle: "",
	songTitle: null,
	note: "",
	sortOrder: 0,
	song: null,
};

beforeEach(() => {
	resetRemoteMocks();
	givenRow("setList", { accountId: ACCOUNT });
	givenRow("setListItem", { id: ITEM, setList: { accountId: ACCOUNT } });
});

const cases = [
	{
		name: "createSetList",
		fn: setLists.createSetList,
		input: { accountId: ACCOUNT, title: "Spring tour", notes: "Bring the capo." },
		arrange: () => data.createSetList.mockResolvedValue({ id: LIST }),
		dataFn: "createSetList",
		args: [ACCOUNT, USER, { title: "Spring tour", notes: "Bring the capo." }],
		redirect: `/slug-acct-one/set-lists/${LIST}`,
		missing: null,
	},
	{
		name: "updateSetList",
		fn: setLists.updateSetList,
		input: { id: LIST, title: "Acoustic set" },
		arrange: () => data.updateSetList.mockResolvedValue({ id: LIST }),
		dataFn: "updateSetList",
		args: [ACCOUNT, LIST, { title: "Acoustic set", notes: "" }],
		outcome: { ok: true },
		missing: "setList",
	},
	{
		name: "deleteSetList",
		fn: setLists.deleteSetList,
		input: { id: LIST },
		arrange: () => data.deleteSetList.mockResolvedValue(true),
		dataFn: "deleteSetList",
		args: [ACCOUNT, LIST],
		outcome: { deleted: true },
		missing: "setList",
	},
	{
		name: "duplicateSetList",
		fn: setLists.duplicateSetList,
		input: { id: LIST },
		arrange: () => data.duplicateSetList.mockResolvedValue({ id: OTHER_LIST }),
		dataFn: "duplicateSetList",
		args: [ACCOUNT, LIST, USER],
		outcome: { id: OTHER_LIST },
		missing: "setList",
	},
	{
		name: "addSetListItem",
		fn: setLists.addSetListItem,
		input: { setListId: LIST, songId: SONG, note: "in G" },
		arrange: () => data.addSetListItem.mockResolvedValue(ROW),
		dataFn: "addSetListItem",
		args: [ACCOUNT, LIST, { songId: SONG, title: "", note: "in G" }],
		outcome: ROW,
		missing: "setList",
	},
	{
		name: "updateSetListItem",
		fn: setLists.updateSetListItem,
		input: { id: ITEM, title: "Encore", note: "slow" },
		arrange: () => data.updateSetListItem.mockResolvedValue(ROW),
		dataFn: "updateSetListItem",
		args: [ACCOUNT, ITEM, { title: "Encore", note: "slow" }],
		outcome: ROW,
		missing: "setListItem",
	},
	{
		name: "deleteSetListItem",
		fn: setLists.deleteSetListItem,
		input: { id: ITEM },
		arrange: () => data.deleteSetListItem.mockResolvedValue(true),
		dataFn: "deleteSetListItem",
		args: [ACCOUNT, ITEM],
		outcome: { deleted: true },
		missing: "setListItem",
	},
	{
		name: "reorderSetListItems",
		fn: setLists.reorderSetListItems,
		input: { setListId: LIST, ids: [OTHER_ITEM, ITEM] },
		arrange: () => data.reorderSetListItems.mockResolvedValue(true),
		dataFn: "reorderSetListItems",
		args: [ACCOUNT, LIST, [OTHER_ITEM, ITEM]],
		outcome: { ok: true },
		missing: "setList",
	},
];

for (const c of cases) {
	const run = () => {
		c.arrange();
		return call(c.fn, c.input);
	};
	describe(c.name, () => {
		it("401 signed out", async () => {
			asSignedOut();
			await expect(run()).rejects.toMatchObject(httpError(401));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		it("404 for a member of another account", async () => {
			asOutsider();
			await expect(run()).rejects.toMatchObject(httpError(404));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		it("404 for a viewer of the account", async () => {
			asViewerOf(ACCOUNT);
			await expect(run()).rejects.toMatchObject(httpError(404));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		if (c.missing)
			it("404 for a row that does not exist", async () => {
				asEditorOf(ACCOUNT);
				givenRow(c.missing, null);
				await expect(run()).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
		it("an editor reaches the data layer scoped by the account", async () => {
			asEditorOf(ACCOUNT);
			if (c.redirect) await expect(run()).rejects.toMatchObject(redirected(c.redirect));
			else await expect(run()).resolves.toEqual(c.outcome);
			expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
		});
	});
}

describe("createSetList", () => {
	it("409 when the account holds as many set lists as it may", async () => {
		asEditorOf(ACCOUNT);
		data.createSetList.mockResolvedValue(null);
		await expect(
			call(setLists.createSetList, { accountId: ACCOUNT, title: "One more" }),
		).rejects.toMatchObject(httpError(409));
	});
	it("refuses an empty title", async () => {
		asEditorOf(ACCOUNT);
		await expect(
			call(setLists.createSetList, { accountId: ACCOUNT, title: "  " }),
		).rejects.toBeTruthy();
		expect(data.createSetList).not.toHaveBeenCalled();
	});
});

describe("duplicateSetList", () => {
	it("409 when the account holds as many set lists as it may", async () => {
		asEditorOf(ACCOUNT);
		data.duplicateSetList.mockResolvedValue(null);
		await expect(call(setLists.duplicateSetList, { id: LIST })).rejects.toMatchObject(
			httpError(409),
		);
	});
});

describe("update and delete answer 404 when the data layer finds nothing", () => {
	beforeEach(() => asEditorOf(ACCOUNT));
	it("updateSetList", async () => {
		data.updateSetList.mockResolvedValue(null);
		await expect(call(setLists.updateSetList, { id: LIST, title: "X" })).rejects.toMatchObject(
			httpError(404),
		);
	});
	it("deleteSetList", async () => {
		data.deleteSetList.mockResolvedValue(false);
		await expect(call(setLists.deleteSetList, { id: LIST })).rejects.toMatchObject(httpError(404));
	});
	it("updateSetListItem", async () => {
		data.updateSetListItem.mockResolvedValue(null);
		await expect(call(setLists.updateSetListItem, { id: ITEM, note: "x" })).rejects.toMatchObject(
			httpError(404),
		);
	});
	it("deleteSetListItem", async () => {
		data.deleteSetListItem.mockResolvedValue(false);
		await expect(call(setLists.deleteSetListItem, { id: ITEM })).rejects.toMatchObject(
			httpError(404),
		);
	});
});

describe("addSetListItem", () => {
	beforeEach(() => asEditorOf(ACCOUNT));
	it("a free-text row goes in with no song", async () => {
		data.addSetListItem.mockResolvedValue(ROW);
		await call(setLists.addSetListItem, { setListId: LIST, title: "Break" });
		expect(data.addSetListItem).toHaveBeenCalledWith(ACCOUNT, LIST, {
			songId: null,
			title: "Break",
			note: "",
		});
	});
	it("409 when the set list is full", async () => {
		data.addSetListItem.mockResolvedValue("full");
		await expect(
			call(setLists.addSetListItem, { setListId: LIST, title: "Break" }),
		).rejects.toMatchObject({ status: 409, body: { message: "This set list is full" } });
	});
	it("404 when the song is not the account's", async () => {
		data.addSetListItem.mockResolvedValue(null);
		await expect(
			call(setLists.addSetListItem, { setListId: LIST, songId: SONG }),
		).rejects.toMatchObject(httpError(404));
	});
	it("a song row may carry its own title", async () => {
		data.addSetListItem.mockResolvedValue(ROW);
		await call(setLists.addSetListItem, { setListId: LIST, songId: SONG, title: "Medley" });
		expect(data.addSetListItem).toHaveBeenCalledWith(ACCOUNT, LIST, {
			songId: SONG,
			title: "Medley",
			note: "",
		});
	});
	it("refuses a row with neither a song nor a title", async () => {
		await expect(call(setLists.addSetListItem, { setListId: LIST })).rejects.toBeTruthy();
		await expect(
			call(setLists.addSetListItem, { setListId: LIST, title: "   " }),
		).rejects.toBeTruthy();
		expect(data.addSetListItem).not.toHaveBeenCalled();
	});
});

describe("updateSetListItem", () => {
	beforeEach(() => asEditorOf(ACCOUNT));
	it("passes an empty title through: a song row follows the song's title again", async () => {
		data.updateSetListItem.mockResolvedValue(ROW);
		await call(setLists.updateSetListItem, { id: ITEM, title: "  ", note: "slow" });
		expect(data.updateSetListItem).toHaveBeenCalledWith(ACCOUNT, ITEM, { title: "", note: "slow" });
	});
});

describe("reorderSetListItems", () => {
	it("400 when the ids are not exactly the set list's rows", async () => {
		asEditorOf(ACCOUNT);
		data.reorderSetListItems.mockResolvedValue(false);
		await expect(
			call(setLists.reorderSetListItems, { setListId: LIST, ids: [ITEM] }),
		).rejects.toMatchObject(httpError(400));
	});
});

describe("importSetListItems", () => {
	const choice = (id: string, title: string, over: { isRestricted?: boolean } = {}) => ({
		id,
		title,
		isPrivate: false,
		projectId: fakeId(`proj-${id}`),
		project: { name: "P", slug: "p", isPrivate: false, isRestricted: over.isRestricted ?? false },
	});
	const OPEN = fakeId("song-open");
	const SHUT = fakeId("song-shut");
	const paste = (text: string) => call(setLists.importSetListItems, { setListId: LIST, text });
	beforeEach(() => {
		data.accountSongChoices.mockResolvedValue([
			choice(OPEN, "Interbellum"),
			choice(SHUT, "Hidden Song", { isRestricted: true }),
		]);
		data.addSetListItems.mockImplementation(
			async (_a: string, _l: string, items: { songId: string | null; title: string }[]) =>
				items.map((i, n) => ({ ...ROW, id: fakeId(`row-${n}`), ...i })),
		);
	});
	it("401 signed out", async () => {
		asSignedOut();
		await expect(paste("Interbellum")).rejects.toMatchObject(httpError(401));
		expect(data.addSetListItems).not.toHaveBeenCalled();
	});
	it("404 for a member of another account, or a viewer of this one", async () => {
		asOutsider();
		await expect(paste("Interbellum")).rejects.toMatchObject(httpError(404));
		asViewerOf(ACCOUNT);
		await expect(paste("Interbellum")).rejects.toMatchObject(httpError(404));
		expect(data.addSetListItems).not.toHaveBeenCalled();
	});
	it("404 for a set list that does not exist", async () => {
		asEditorOf(ACCOUNT);
		givenRow("setList", null);
		await expect(paste("Interbellum")).rejects.toMatchObject(httpError(404));
		expect(data.addSetListItems).not.toHaveBeenCalled();
	});
	it("400 when no line is left", async () => {
		asEditorOf(ACCOUNT);
		await expect(paste(" \n1.\n- \n")).rejects.toMatchObject({
			status: 400,
			body: { message: "Paste one song per line." },
		});
		expect(data.addSetListItems).not.toHaveBeenCalled();
	});
	it("refuses more than 20,000 characters", async () => {
		asEditorOf(ACCOUNT);
		await expect(paste("a".repeat(20001))).rejects.toBeTruthy();
		expect(data.addSetListItems).not.toHaveBeenCalled();
	});
	it("409 when the rows would pass the cap", async () => {
		asEditorOf(ACCOUNT);
		data.addSetListItems.mockResolvedValue("full");
		await expect(paste("Interbellum")).rejects.toMatchObject({
			status: 409,
			body: { message: "That would be more than 200 rows." },
		});
	});
	it("404 when the data layer finds no set list", async () => {
		asEditorOf(ACCOUNT);
		data.addSetListItems.mockResolvedValue(null);
		await expect(paste("Interbellum")).rejects.toMatchObject(httpError(404));
	});
	it("matches lines to songs the member may open, keeps the rest as text, and counts the matches", async () => {
		asEditorOf(ACCOUNT);
		const out = (await paste("1. interbellum (acoustic)\n2. Break\n3. Hidden Song")) as {
			rows: { songId: string | null; title: string }[];
			matched: number;
		};
		expect(data.accountSongChoices).toHaveBeenCalledWith(ACCOUNT);
		expect(data.projectRolesOf).toHaveBeenCalledWith(ACCOUNT, USER);
		expect(data.addSetListItems).toHaveBeenCalledWith(ACCOUNT, LIST, [
			{
				songId: OPEN,
				title: "interbellum (acoustic)",
				note: "",
				line: "interbellum (acoustic)",
			},
			{ songId: null, title: "Break", note: "", line: "Break" },
			{ songId: null, title: "Hidden Song", note: "", line: "Hidden Song" },
		]);
		expect(out.matched).toBe(1);
		expect(out.rows).toHaveLength(3);
	});
	it("a line that is the song's title follows the song's title ('')", async () => {
		asEditorOf(ACCOUNT);
		await paste("1. the interbellum!\n2. Interbellum");
		expect(data.addSetListItems).toHaveBeenCalledWith(ACCOUNT, LIST, [
			{ songId: OPEN, title: "", note: "", line: "the interbellum!" },
			{ songId: OPEN, title: "", note: "", line: "Interbellum" },
		]);
	});
	it("a song on a restricted project matches for a member of that project", async () => {
		asEditorOf(ACCOUNT);
		data.projectRolesOf.mockResolvedValue({ [fakeId(`proj-${SHUT}`)]: "member" });
		const out = (await paste("Hidden Song")) as { matched: number };
		expect(data.addSetListItems).toHaveBeenCalledWith(ACCOUNT, LIST, [
			{ songId: SHUT, title: "", note: "", line: "Hidden Song" },
		]);
		expect(out.matched).toBe(1);
	});
});
