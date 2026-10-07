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

/** Authorization of the "do not use AI" switches: an editor of the project's or song's account. */
const ai = await import("./ai.remote");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");

beforeEach(() => {
	resetRemoteMocks();
	givenRow("song", { accountId: ACCOUNT, projectId: PROJECT });
	givenRow("project", { accountId: ACCOUNT });
});

const cases = [
	{
		name: "setProjectAi",
		fn: ai.setProjectAi,
		input: { id: PROJECT, noAi: "true" },
		dataFn: "setProjectNoAi",
		args: [ACCOUNT, PROJECT, true],
	},
	{
		name: "setSongAi",
		fn: ai.setSongAi,
		input: { id: SONG, noAi: "false" },
		dataFn: "setSongNoAi",
		args: [ACCOUNT, SONG, false],
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
		it("an editor sets it within the account", async () => {
			asEditorOf(ACCOUNT);
			data[c.dataFn].mockResolvedValue(true);
			await expect(call(c.fn, c.input)).resolves.toEqual({ noAi: c.args[2] });
			expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
		});
	});
}
