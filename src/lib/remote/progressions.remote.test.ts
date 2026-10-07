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

/** Authorization of saved progressions: every member sees the library, its editors keep it. */
const progressions = await import("./progressions.remote");

const PROGRESSION = fakeId("prog-one");
const progressionData = { bpm: 120, beatsPerBar: 4, entries: [] };
const row = { id: PROGRESSION, name: "Verse", updatedAt: new Date(0) };

beforeEach(() => {
	resetRemoteMocks();
	givenRow("progression", { accountId: ACCOUNT });
	data.listProgressions.mockResolvedValue([]);
	data.createProgression.mockResolvedValue(row);
	data.updateProgression.mockResolvedValue(row);
	data.renameProgression.mockResolvedValue({ id: PROGRESSION, name: "Two" });
	data.setProgressionNotes.mockResolvedValue(true);
	data.deleteProgressionIfEmpty.mockResolvedValue(false);
});

describe("listProgressions", () => {
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(progressions.listProgressions, { accountId: ACCOUNT })).rejects.toMatchObject(
			httpError(401),
		);
	});
	it("404 for a member of another account", async () => {
		asOutsider();
		await expect(call(progressions.listProgressions, { accountId: ACCOUNT })).rejects.toMatchObject(
			httpError(404),
		);
		expect(data.listProgressions).not.toHaveBeenCalled();
	});
	it("every member sees the library, a viewer-role member too", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(progressions.listProgressions, { accountId: ACCOUNT })).resolves.toEqual([]);
		expect(data.listProgressions).toHaveBeenCalledWith(ACCOUNT);
		asViewerOf(ACCOUNT);
		await expect(call(progressions.listProgressions, { accountId: ACCOUNT })).resolves.toEqual([]);
	});
});

describe("saveProgression", () => {
	const input = { accountId: ACCOUNT, name: "Verse", data: progressionData };
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(progressions.saveProgression, input)).rejects.toMatchObject(httpError(401));
	});
	it("404 for an outsider and for a viewer", async () => {
		asOutsider();
		await expect(call(progressions.saveProgression, input)).rejects.toMatchObject(httpError(404));
		asViewerOf(ACCOUNT);
		await expect(call(progressions.saveProgression, input)).rejects.toMatchObject(httpError(404));
		expect(data.createProgression).not.toHaveBeenCalled();
	});
	it("an editor creates one as their own, or updates one within the account", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(progressions.saveProgression, input)).resolves.toEqual(row);
		expect(data.createProgression).toHaveBeenCalledWith(
			ACCOUNT,
			USER,
			"Verse",
			progressionData,
			"",
		);
		await call(progressions.saveProgression, { ...input, id: PROGRESSION, notes: "n" });
		expect(data.updateProgression).toHaveBeenCalledWith(ACCOUNT, PROGRESSION, {
			name: "Verse",
			data: progressionData,
			notes: "n",
		});
	});
});

describe("the progression's own functions (its account, editors)", () => {
	const cases = [
		{
			name: "saveProgressionNotes",
			fn: progressions.saveProgressionNotes,
			input: { id: PROGRESSION, markdown: "n" },
			dataFn: "setProgressionNotes",
			args: [ACCOUNT, PROGRESSION, "n"],
			outcome: { saved: true, deleted: false },
		},
		{
			name: "renameProgression",
			fn: progressions.renameProgression,
			input: { id: PROGRESSION, name: "Two" },
			dataFn: "renameProgression",
			args: [ACCOUNT, PROGRESSION, "Two"],
			outcome: { id: PROGRESSION, name: "Two" },
		},
		{
			name: "deleteProgression",
			fn: progressions.deleteProgression,
			input: { id: PROGRESSION },
			dataFn: "deleteProgression",
			args: [ACCOUNT, PROGRESSION],
			outcome: { id: PROGRESSION },
		},
	];
	for (const c of cases) {
		describe(c.name, () => {
			it("401 signed out", async () => {
				asSignedOut();
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(401));
			});
			it("404 for an outsider and for a viewer", async () => {
				asOutsider();
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(404));
				asViewerOf(ACCOUNT);
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("an editor does it, scoped by the progression's account", async () => {
				asEditorOf(ACCOUNT);
				await expect(call(c.fn, c.input)).resolves.toEqual(c.outcome);
				expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
			});
		});
	}
	it("clearing the notes of an empty progression removes it, within the account", async () => {
		asEditorOf(ACCOUNT);
		data.deleteProgressionIfEmpty.mockResolvedValue(true);
		await expect(
			call(progressions.saveProgressionNotes, { id: PROGRESSION, markdown: " " }),
		).resolves.toEqual({ saved: true, deleted: true });
		expect(data.deleteProgressionIfEmpty).toHaveBeenCalledWith(ACCOUNT, PROGRESSION);
	});
});
