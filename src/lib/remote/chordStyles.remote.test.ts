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
import { CHORD_RECIPES } from "$lib/constants/chordStyles";

/** Authorization of custom chord styles: every member sees the library, its editors keep it. */
const styles = await import("./chordStyles.remote");

const STYLE = fakeId("style-one");
const recipe = Object.keys(CHORD_RECIPES)[0];
const ring = Array.from({ length: 12 }, () => ({ plain: recipe, held: recipe }));
const styleData = { major: ring, minor: ring };

beforeEach(() => {
	resetRemoteMocks();
	givenRow("chordStyle", { accountId: ACCOUNT });
	data.listChordStyles.mockResolvedValue([]);
	data.createChordStyle.mockResolvedValue({ id: STYLE, name: "Jazz", updatedAt: new Date(0) });
	data.updateChordStyle.mockResolvedValue({ id: STYLE, name: "Jazz", updatedAt: new Date(0) });
	data.renameChordStyle.mockResolvedValue({ id: STYLE, name: "Two" });
});

describe("listChordStyles", () => {
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(styles.listChordStyles, { accountId: ACCOUNT })).rejects.toMatchObject(
			httpError(401),
		);
	});
	it("404 for a member of another account", async () => {
		asOutsider();
		await expect(call(styles.listChordStyles, { accountId: ACCOUNT })).rejects.toMatchObject(
			httpError(404),
		);
		expect(data.listChordStyles).not.toHaveBeenCalled();
	});
	it("every member sees the library, a viewer-role member too", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(styles.listChordStyles, { accountId: ACCOUNT })).resolves.toEqual([]);
		expect(data.listChordStyles).toHaveBeenCalledWith(ACCOUNT);
		asViewerOf(ACCOUNT);
		await expect(call(styles.listChordStyles, { accountId: ACCOUNT })).resolves.toEqual([]);
	});
});

describe("saveChordStyle", () => {
	const input = { accountId: ACCOUNT, name: "Jazz", data: styleData };
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(styles.saveChordStyle, input)).rejects.toMatchObject(httpError(401));
	});
	it("404 for a member of another account", async () => {
		asOutsider();
		await expect(call(styles.saveChordStyle, input)).rejects.toMatchObject(httpError(404));
		expect(data.createChordStyle).not.toHaveBeenCalled();
	});
	it("404 for a viewer", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(styles.saveChordStyle, input)).rejects.toMatchObject(httpError(404));
	});
	it("an editor creates one as their own, or updates one within the account", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(styles.saveChordStyle, input)).resolves.toEqual({
			id: STYLE,
			name: "Jazz",
			updatedAt: new Date(0),
		});
		expect(data.createChordStyle).toHaveBeenCalledWith(ACCOUNT, USER, "Jazz", styleData);
		await call(styles.saveChordStyle, { ...input, id: STYLE });
		expect(data.updateChordStyle).toHaveBeenCalledWith(ACCOUNT, STYLE, {
			name: "Jazz",
			data: styleData,
		});
	});
});

describe("renameChordStyle and deleteChordStyle (the style's account, editors)", () => {
	const cases = [
		{
			name: "renameChordStyle",
			fn: styles.renameChordStyle,
			input: { id: STYLE, name: "Two" },
			dataFn: "renameChordStyle",
			args: [ACCOUNT, STYLE, "Two"],
			outcome: { id: STYLE, name: "Two" },
		},
		{
			name: "deleteChordStyle",
			fn: styles.deleteChordStyle,
			input: { id: STYLE },
			dataFn: "deleteChordStyle",
			args: [ACCOUNT, STYLE],
			outcome: { id: STYLE },
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
			it("an editor does it, scoped by the style's account", async () => {
				asEditorOf(ACCOUNT);
				await expect(call(c.fn, c.input)).resolves.toEqual(c.outcome);
				expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
			});
		});
	}
});
