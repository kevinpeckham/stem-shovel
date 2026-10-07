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
import { data, givenRow, jobs, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Authorization of the attachment remote functions: an editor of the file's account (memberOf → accountOfFile). */
const files = await import("./files.remote");

const FILE = fakeId("file-one");
const SONG = fakeId("song-one");
const DEMO = fakeId("demo-one");

beforeEach(() => {
	resetRemoteMocks();
	givenRow("songFile", { accountId: ACCOUNT, projectId: fakeId("proj-one") });
});

const cases = [
	{
		name: "updateFile",
		fn: files.updateFile,
		input: { id: FILE, title: "Score", description: "" },
		arrange: () =>
			data.updateFile.mockResolvedValue({ title: "Score", description: "", isNotation: false }),
		dataFn: "updateFile",
		args: [ACCOUNT, FILE, { title: "Score", description: "", isNotation: undefined }],
		outcome: { title: "Score", description: "", isNotation: false },
	},
	{
		name: "attachFile",
		fn: files.attachFile,
		input: { id: FILE, songId: SONG },
		arrange: () => data.attachFile.mockResolvedValue({ songId: SONG, isNotation: false }),
		dataFn: "attachFile",
		args: [ACCOUNT, FILE, SONG],
		outcome: { songId: SONG, isNotation: false },
	},
	{
		name: "deleteFile",
		fn: files.deleteFile,
		input: { id: FILE },
		arrange: () => data.deleteFile.mockResolvedValue(true),
		dataFn: "deleteFile",
		args: [ACCOUNT, FILE],
		outcome: { deleted: true },
	},
	{
		name: "useAsDemo",
		fn: files.useAsDemo,
		input: { id: FILE },
		arrange: () => data.createDemoFromFile.mockResolvedValue({ id: DEMO }),
		dataFn: "createDemoFromFile",
		args: [ACCOUNT, USER, FILE],
		outcome: { demoId: DEMO },
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
		it("404 for a file that does not exist", async () => {
			asEditorOf(ACCOUNT);
			givenRow("songFile", null);
			await expect(run()).rejects.toMatchObject(httpError(404));
		});
		it("an editor reaches the data layer scoped by the file's account", async () => {
			asEditorOf(ACCOUNT);
			await expect(run()).resolves.toEqual(c.outcome);
			expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
		});
	});
}

it("useAsDemo schedules the demo's rendition in the jobs function", async () => {
	asEditorOf(ACCOUNT);
	data.createDemoFromFile.mockResolvedValue({ id: DEMO });
	await call(files.useAsDemo, { id: FILE });
	expect(jobs.scheduleDemoPlayback).toHaveBeenCalledWith([DEMO]);
});
