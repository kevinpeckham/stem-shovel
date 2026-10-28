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
const ROW = { id: ITEM, songId: null, title: "Break", note: "", sortOrder: 0, song: null };

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
	it("refuses a row with both a song and a title, or neither", async () => {
		await expect(
			call(setLists.addSetListItem, { setListId: LIST, songId: SONG, title: "Both" }),
		).rejects.toBeTruthy();
		await expect(call(setLists.addSetListItem, { setListId: LIST })).rejects.toBeTruthy();
		expect(data.addSetListItem).not.toHaveBeenCalled();
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
