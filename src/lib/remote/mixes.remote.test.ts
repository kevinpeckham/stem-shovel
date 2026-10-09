import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_ACCOUNT,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** The mix commands (docs/mixes.md): an editor of the account renames, writes the notes and removes; anyone else is "not found". */
const mixes = await import("./mixes.remote");

const MIX = fakeId("mix-one");

beforeEach(() => {
	resetRemoteMocks();
	givenRow("songMix", { accountId: ACCOUNT });
	data.renameMix.mockResolvedValue({ id: MIX, label: "Final" });
	data.setMixNotes.mockResolvedValue({ id: MIX, notes: "Vocal up" });
	data.deleteMix.mockResolvedValue(true);
});

describe("renameMix, setMixNotes, removeMix", () => {
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(mixes.renameMix, { id: MIX, label: "Final" })).rejects.toMatchObject(
			httpError(401),
		);
	});
	it("404 for an outsider, a viewer, and an editor of another account", async () => {
		for (const who of [
			() => asOutsider(),
			() => asViewerOf(ACCOUNT),
			() => asEditorOf(OTHER_ACCOUNT),
		]) {
			who();
			await expect(call(mixes.renameMix, { id: MIX, label: "Final" })).rejects.toMatchObject(
				httpError(404),
			);
			await expect(call(mixes.setMixNotes, { id: MIX, notes: "x" })).rejects.toMatchObject(
				httpError(404),
			);
			await expect(call(mixes.removeMix, { id: MIX })).rejects.toMatchObject(httpError(404));
		}
		expect(data.renameMix).not.toHaveBeenCalled();
		expect(data.deleteMix).not.toHaveBeenCalled();
	});
	it("an editor renames, writes the notes and removes", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(mixes.renameMix, { id: MIX, label: " Final " })).resolves.toEqual({
			id: MIX,
			label: "Final",
		});
		expect(data.renameMix).toHaveBeenCalledWith(ACCOUNT, MIX, "Final");
		await expect(call(mixes.setMixNotes, { id: MIX, notes: "Vocal up" })).resolves.toEqual({
			id: MIX,
			notes: "Vocal up",
		});
		expect(data.setMixNotes).toHaveBeenCalledWith(ACCOUNT, MIX, "Vocal up");
		await expect(call(mixes.removeMix, { id: MIX })).resolves.toEqual({ deleted: true });
		expect(data.deleteMix).toHaveBeenCalledWith(ACCOUNT, MIX);
	});
	it("an empty name is refused by the schema; the notes may be emptied", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(mixes.renameMix, { id: MIX, label: "  " })).rejects.toBeDefined();
		await expect(call(mixes.setMixNotes, { id: MIX, notes: "" })).resolves.toEqual({
			id: MIX,
			notes: "Vocal up",
		});
		expect(data.setMixNotes).toHaveBeenCalledWith(ACCOUNT, MIX, "");
	});
	it("404 when the data layer finds nothing to change", async () => {
		asEditorOf(ACCOUNT);
		data.renameMix.mockResolvedValue(null);
		data.deleteMix.mockResolvedValue(false);
		await expect(call(mixes.renameMix, { id: MIX, label: "Final" })).rejects.toMatchObject(
			httpError(404),
		);
		await expect(call(mixes.removeMix, { id: MIX })).rejects.toMatchObject(httpError(404));
	});
});
