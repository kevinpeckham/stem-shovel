import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Authorization of notation files: an editor of the file's account (memberOf → accountOfNotation). */
const notation = await import("./notation.remote");

const NOTATION = fakeId("notation-one");

beforeEach(() => {
	resetRemoteMocks();
	givenRow("songNotation", { accountId: ACCOUNT });
});

const cases = [
	{
		name: "updateNotation",
		fn: notation.updateNotation,
		input: { id: NOTATION, title: "Lead sheet", description: "" },
		arrange: () => data.updateNotation.mockResolvedValue({ title: "Lead sheet", description: "" }),
		dataFn: "updateNotation",
		args: [ACCOUNT, NOTATION, { title: "Lead sheet", description: "" }],
		outcome: { title: "Lead sheet", description: "" },
	},
	{
		name: "deleteNotation",
		fn: notation.deleteNotation,
		input: { id: NOTATION },
		arrange: () => data.deleteNotation.mockResolvedValue(true),
		dataFn: "deleteNotation",
		args: [ACCOUNT, NOTATION],
		outcome: { deleted: true },
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
		it("404 for a viewer", async () => {
			asViewerOf(ACCOUNT);
			await expect(run()).rejects.toMatchObject(httpError(404));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		it("an editor reaches the data layer scoped by the file's account", async () => {
			asEditorOf(ACCOUNT);
			await expect(run()).resolves.toEqual(c.outcome);
			expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
		});
	});
}
