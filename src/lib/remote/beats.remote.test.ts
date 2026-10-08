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
} from "../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";
import { startingDrumProject } from "#lib/utils/startingDrumProject.js";

/** Authorization of saved beats: every member sees the library, its editors keep it. */
const beats = await import("./beats.remote");

const BEAT = fakeId("beat-one");
const SONG = fakeId("song-one");

beforeEach(() => {
	resetRemoteMocks();
	givenRow("beat", { accountId: ACCOUNT });
	data.listBeats.mockResolvedValue([]);
	data.createBeat.mockResolvedValue({ id: BEAT, name: "Beat", updatedAt: new Date(0) });
	data.updateBeat.mockResolvedValue({ id: BEAT, name: "Beat", updatedAt: new Date(0) });
	data.renameBeat.mockResolvedValue({ id: BEAT, name: "Two" });
});

describe("listBeats", () => {
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(beats.listBeats, { accountId: ACCOUNT })).rejects.toMatchObject(
			httpError(401),
		);
	});
	it("404 for a member of another account: the account id in the request is checked", async () => {
		asOutsider();
		await expect(call(beats.listBeats, { accountId: ACCOUNT })).rejects.toMatchObject(
			httpError(404),
		);
		expect(data.listBeats).not.toHaveBeenCalled();
	});
	it("every member sees the library, a viewer-role member too", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(beats.listBeats, { accountId: ACCOUNT })).resolves.toEqual([]);
		expect(data.listBeats).toHaveBeenCalledWith(ACCOUNT);
		asViewerOf(ACCOUNT);
		await expect(call(beats.listBeats, { accountId: ACCOUNT })).resolves.toEqual([]);
	});
});

describe("saveBeat", () => {
	const input = { accountId: ACCOUNT, name: "Beat", data: startingDrumProject() };
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(beats.saveBeat, input)).rejects.toMatchObject(httpError(401));
	});
	it("404 for a member of another account", async () => {
		asOutsider();
		await expect(call(beats.saveBeat, input)).rejects.toMatchObject(httpError(404));
		expect(data.createBeat).not.toHaveBeenCalled();
	});
	it("404 for a viewer", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(beats.saveBeat, input)).rejects.toMatchObject(httpError(404));
		expect(data.createBeat).not.toHaveBeenCalled();
	});
	it("an editor creates one as their own in the account", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(beats.saveBeat, input)).resolves.toEqual({
			id: BEAT,
			name: "Beat",
			updatedAt: new Date(0),
		});
		expect(data.createBeat).toHaveBeenCalledWith(ACCOUNT, USER, "Beat", expect.anything(), null);
	});
	it("a song for the beat is looked up within the account", async () => {
		asEditorOf(ACCOUNT);
		data.songForBeat.mockResolvedValue({ id: SONG });
		await call(beats.saveBeat, { ...input, songId: SONG });
		expect(data.songForBeat).toHaveBeenCalledWith(ACCOUNT, SONG);
		expect(data.createBeat).toHaveBeenCalledWith(ACCOUNT, USER, "Beat", expect.anything(), SONG);
	});
	it("an existing beat is updated within the account", async () => {
		asEditorOf(ACCOUNT);
		await call(beats.saveBeat, { ...input, id: BEAT });
		expect(data.updateBeat).toHaveBeenCalledWith(
			ACCOUNT,
			BEAT,
			expect.objectContaining({ name: "Beat" }),
		);
		expect(data.createBeat).not.toHaveBeenCalled();
	});
});

describe("renameBeat and deleteBeat (the beat's account, editors)", () => {
	const cases = [
		{
			name: "renameBeat",
			fn: beats.renameBeat,
			input: { id: BEAT, name: "Two" },
			dataFn: "renameBeat",
			args: [ACCOUNT, BEAT, "Two"],
			outcome: { id: BEAT, name: "Two" },
		},
		{
			name: "deleteBeat",
			fn: beats.deleteBeat,
			input: { id: BEAT },
			dataFn: "deleteBeat",
			args: [ACCOUNT, BEAT],
			outcome: { id: BEAT },
		},
	];
	for (const c of cases) {
		describe(c.name, () => {
			it("401 signed out", async () => {
				asSignedOut();
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(401));
			});
			it("404 for a member of another account", async () => {
				asOutsider();
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("404 for a viewer", async () => {
				asViewerOf(ACCOUNT);
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("an editor does it, scoped by the beat's account", async () => {
				asEditorOf(ACCOUNT);
				await expect(call(c.fn, c.input)).resolves.toEqual(c.outcome);
				expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
			});
		});
	}
});
