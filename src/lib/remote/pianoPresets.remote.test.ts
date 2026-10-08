import { beforeEach, describe, expect, it } from "vite-plus/test";
import * as v from "valibot";
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
import { PianoPresetDataSchema } from "#lib/val/PianoPresetSchema.js";

/** Authorization of piano presets: every member sees the library, its editors keep it. */
const presets = await import("./pianoPresets.remote");

const PRESET = fakeId("preset-one");
const presetData = v.parse(PianoPresetDataSchema, {});
const row = { id: PRESET, name: "Warm", slot: null, chordSlot: null, updatedAt: new Date(0) };

beforeEach(() => {
	resetRemoteMocks();
	givenRow("pianoPreset", { accountId: ACCOUNT });
	data.listPianoPresets.mockResolvedValue([]);
	data.countPianoPresets.mockResolvedValue(0);
	data.createPianoPreset.mockResolvedValue(row);
	data.updatePianoPreset.mockResolvedValue(row);
	data.renamePianoPreset.mockResolvedValue({ id: PRESET, name: "Two" });
	data.setPianoPresetSlot.mockResolvedValue({ id: PRESET, slot: 1, chordSlot: null });
});

describe("listPianoPresets", () => {
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(presets.listPianoPresets, { accountId: ACCOUNT })).rejects.toMatchObject(
			httpError(401),
		);
	});
	it("404 for a member of another account", async () => {
		asOutsider();
		await expect(call(presets.listPianoPresets, { accountId: ACCOUNT })).rejects.toMatchObject(
			httpError(404),
		);
		expect(data.listPianoPresets).not.toHaveBeenCalled();
	});
	it("every member sees the library, a viewer-role member too", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(presets.listPianoPresets, { accountId: ACCOUNT })).resolves.toEqual([]);
		expect(data.listPianoPresets).toHaveBeenCalledWith(ACCOUNT);
		asViewerOf(ACCOUNT);
		await expect(call(presets.listPianoPresets, { accountId: ACCOUNT })).resolves.toEqual([]);
	});
});

describe("savePianoPreset", () => {
	const input = { accountId: ACCOUNT, name: "Warm", data: presetData };
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(presets.savePianoPreset, input)).rejects.toMatchObject(httpError(401));
	});
	it("404 for an outsider and for a viewer", async () => {
		asOutsider();
		await expect(call(presets.savePianoPreset, input)).rejects.toMatchObject(httpError(404));
		asViewerOf(ACCOUNT);
		await expect(call(presets.savePianoPreset, input)).rejects.toMatchObject(httpError(404));
		expect(data.createPianoPreset).not.toHaveBeenCalled();
	});
	it("an editor creates one as their own, or updates one within the account", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(presets.savePianoPreset, input)).resolves.toEqual({
			id: PRESET,
			name: "Warm",
			slot: null,
			chordSlot: null,
			updatedAt: new Date(0),
		});
		expect(data.createPianoPreset).toHaveBeenCalledWith(
			ACCOUNT,
			USER,
			"Warm",
			presetData,
			null,
			"piano",
		);
		await call(presets.savePianoPreset, { ...input, id: PRESET, slot: 2, instrument: "chords" });
		expect(data.updatePianoPreset).toHaveBeenCalledWith(ACCOUNT, PRESET, {
			name: "Warm",
			data: presetData,
			slot: 2,
			instrument: "chords",
		});
	});
	it("400 once the account holds as many as it may", async () => {
		asEditorOf(ACCOUNT);
		data.countPianoPresets.mockResolvedValue(1000);
		await expect(call(presets.savePianoPreset, input)).rejects.toMatchObject(httpError(400));
		expect(data.countPianoPresets).toHaveBeenCalledWith(ACCOUNT);
	});
});

describe("renamePianoPreset, setPianoPresetSlot and deletePianoPreset (the preset's account, editors)", () => {
	const cases = [
		{
			name: "renamePianoPreset",
			fn: presets.renamePianoPreset,
			input: { id: PRESET, name: "Two" },
			dataFn: "renamePianoPreset",
			args: [ACCOUNT, PRESET, "Two"],
			outcome: { id: PRESET, name: "Two" },
		},
		{
			name: "setPianoPresetSlot",
			fn: presets.setPianoPresetSlot,
			input: { id: PRESET, slot: 1 },
			dataFn: "setPianoPresetSlot",
			args: [ACCOUNT, PRESET, 1, "piano"],
			outcome: { id: PRESET, slot: 1, chordSlot: null },
		},
		{
			name: "deletePianoPreset",
			fn: presets.deletePianoPreset,
			input: { id: PRESET },
			dataFn: "deletePianoPreset",
			args: [ACCOUNT, PRESET],
			outcome: { id: PRESET },
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
			it("an editor does it, scoped by the preset's account", async () => {
				asEditorOf(ACCOUNT);
				await expect(call(c.fn, c.input)).resolves.toEqual(c.outcome);
				expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
			});
		});
	}
});
