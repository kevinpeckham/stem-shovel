import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asAdminOf,
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
 * Authorization of the arrangement remote functions (docs/arrangements.md):
 * each finds the song's or the arrangement's account and needs an editor
 * there (memberOf → requireEditor), a restricted project's rules included,
 * as the song's stem actions do; a refusal of the data layer lands on its
 * field.
 */
const arrangements = await import("./arrangements.remote");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const ARRANGEMENT = fakeId("arr-one");
const OTHER = fakeId("arr-two");

/** The rows access.ts finds, each pointing back to ACCOUNT and the song's project. */
function givenRows() {
	givenRow("song", { accountId: ACCOUNT, projectId: PROJECT });
	givenRow("songArrangement", { accountId: ACCOUNT, song: { projectId: PROJECT } });
}

interface Case {
	name: string;
	fn: object;
	input: unknown;
	arrange?: () => unknown;
	dataFn: string;
	args: unknown[];
	outcome: unknown;
}

beforeEach(() => {
	resetRemoteMocks();
	givenRows();
});

describe("editor-gated functions", () => {
	const cases: Case[] = [
		{
			name: "createArrangement",
			fn: arrangements.createArrangement,
			input: { songId: SONG, name: " Acoustic ", note: "capo 2", from: OTHER },
			arrange: () => data.createArrangement.mockResolvedValue({ ok: true, id: ARRANGEMENT }),
			dataFn: "createArrangement",
			args: [ACCOUNT, USER, SONG, { name: "Acoustic", note: "capo 2", from: OTHER }],
			outcome: { id: ARRANGEMENT },
		},
		{
			name: "updateArrangement",
			fn: arrangements.updateArrangement,
			input: { id: ARRANGEMENT, name: "Live" },
			arrange: () =>
				data.updateArrangement.mockResolvedValue({ ok: true, id: ARRANGEMENT, songId: SONG }),
			dataFn: "updateArrangement",
			args: [ACCOUNT, ARRANGEMENT, { name: "Live", note: undefined }],
			outcome: { id: ARRANGEMENT },
		},
		{
			name: "deleteArrangement",
			fn: arrangements.deleteArrangement,
			input: { id: ARRANGEMENT },
			arrange: () => data.deleteArrangement.mockResolvedValue({ songId: SONG }),
			dataFn: "deleteArrangement",
			args: [ACCOUNT, ARRANGEMENT],
			outcome: undefined,
		},
		{
			name: "reorderArrangements",
			fn: arrangements.reorderArrangements,
			input: { songId: SONG, ids: [OTHER, ARRANGEMENT] },
			arrange: () => data.reorderArrangements.mockResolvedValue([OTHER, ARRANGEMENT]),
			dataFn: "reorderArrangements",
			args: [ACCOUNT, SONG, [OTHER, ARRANGEMENT]],
			outcome: { ids: [OTHER, ARRANGEMENT] },
		},
	];
	for (const c of cases) {
		const run = () => {
			c.arrange?.();
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
			it("404 for a member not added to the restricted project", async () => {
				asEditorOf(ACCOUNT);
				data.projectRestricted.mockResolvedValue(true);
				await expect(run()).rejects.toMatchObject(httpError(404));
				expect(data.projectRestricted).toHaveBeenCalledWith(PROJECT);
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("a member added to the restricted project passes", async () => {
				asEditorOf(ACCOUNT);
				data.projectRestricted.mockResolvedValue(true);
				data.projectRoleOf.mockResolvedValue("member");
				await expect(run()).resolves.toEqual(c.outcome);
			});
			it("an admin passes the restriction", async () => {
				asAdminOf(ACCOUNT);
				data.projectRestricted.mockResolvedValue(true);
				await expect(run()).resolves.toEqual(c.outcome);
				expect(data.projectRestricted).not.toHaveBeenCalled();
			});
			it("an editor reaches the data layer scoped by the account", async () => {
				asEditorOf(ACCOUNT);
				await expect(run()).resolves.toEqual(c.outcome);
				expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
			});
		});
	}
});

describe("what the data layer refuses", () => {
	beforeEach(() => asEditorOf(ACCOUNT));
	it("a taken name lands on the name field", async () => {
		data.createArrangement.mockResolvedValue({ ok: false, field: "name", error: "Taken." });
		await expect(
			call(arrangements.createArrangement, { songId: SONG, name: "Main" }),
		).rejects.toMatchObject({ issues: [{ path: ["name"], message: "Taken." }] });
		data.updateArrangement.mockResolvedValue({ ok: false, field: "note", error: "Too long." });
		await expect(
			call(arrangements.updateArrangement, { id: ARRANGEMENT, note: "x" }),
		).rejects.toMatchObject({ issues: [{ path: ["note"], message: "Too long." }] });
	});
	it("a song or an arrangement the data layer cannot find is a 404", async () => {
		data.createArrangement.mockResolvedValue(null);
		await expect(
			call(arrangements.createArrangement, { songId: SONG, name: "B" }),
		).rejects.toMatchObject(httpError(404));
		data.updateArrangement.mockResolvedValue(null);
		await expect(
			call(arrangements.updateArrangement, { id: ARRANGEMENT, name: "B" }),
		).rejects.toMatchObject(httpError(404));
		data.deleteArrangement.mockResolvedValue(null);
		await expect(call(arrangements.deleteArrangement, { id: ARRANGEMENT })).rejects.toMatchObject(
			httpError(404),
		);
	});
	it("an unknown arrangement id is a 404 before any data call", async () => {
		givenRow("songArrangement", null);
		await expect(call(arrangements.deleteArrangement, { id: ARRANGEMENT })).rejects.toMatchObject(
			httpError(404),
		);
		expect(data.deleteArrangement).not.toHaveBeenCalled();
	});
});
