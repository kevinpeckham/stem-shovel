import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
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
import {
	aiDetect,
	data,
	givenRow,
	jobs,
	rateLimited,
	resetRemoteMocks,
} from "../../../tests/helpers/fakeServerModules";

const redis = vi.hoisted(() => ({
	redisConfigured: vi.fn(() => false),
	redisPipeline: vi.fn(async () => [] as unknown[]),
}));
vi.mock("#lib/server/redis.js", () => redis);

/** Authorization of the attachment remote functions: an editor of the file's account (memberOf → accountOfFile). */
const files = await import("./files.remote");

const FILE = fakeId("file-one");
const SONG = fakeId("song-one");
const DEMO = fakeId("demo-one");
const READ = "m1 key C major 4/4: C\nm2: G";
/** The score file `chartReadOfFile` finds: a notation PDF of SONG, with a read when `chartRead` is given. */
const scoreRow = (over: Record<string, unknown> = {}) => ({
	id: FILE,
	songId: SONG,
	url: "https://blob/score.pdf",
	filename: "score.pdf",
	kind: "pdf",
	chartRead: null,
	chartReadEdited: false,
	...over,
});
const givenScore = (over: Record<string, unknown> = {}, songOver: Record<string, unknown> = {}) => {
	data.chartReadOfFile.mockResolvedValue(scoreRow(over));
	data.getSongById.mockResolvedValue({ noAi: false, project: { noAi: false }, ...songOver });
};

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
	{
		name: "readChartOfFile",
		fn: files.readChartOfFile,
		input: { id: FILE },
		arrange: () => {
			givenScore({ chartRead: READ, chartReadEdited: true });
			aiDetect.readChartOfScore.mockResolvedValue({ text: READ, fromModel: false });
		},
		dataFn: "chartReadOfFile",
		args: [ACCOUNT, FILE],
		outcome: { text: READ, edited: true, fromModel: false, warnings: [] },
	},
	{
		name: "saveChartReadOfFile",
		fn: files.saveChartReadOfFile,
		input: { id: FILE, text: `  ${READ}\n` },
		arrange: () => {
			givenScore();
			data.saveChartRead.mockResolvedValue({ chartRead: READ, chartReadEdited: true });
		},
		dataFn: "saveChartRead",
		args: [ACCOUNT, FILE, READ, true],
		outcome: { text: READ, edited: true, warnings: [] },
	},
	{
		name: "clearChartReadOfFile",
		fn: files.clearChartReadOfFile,
		input: { id: FILE },
		arrange: () => {
			givenScore({ chartRead: READ, chartReadEdited: true });
			data.saveChartRead.mockResolvedValue({ chartRead: null, chartReadEdited: false });
		},
		dataFn: "saveChartRead",
		args: [ACCOUNT, FILE, null, false],
		outcome: { cleared: true },
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

describe('the chart read (docs/audio-engine.md, "The chart read is stored")', () => {
	beforeEach(() => {
		asEditorOf(ACCOUNT);
		aiDetect.aiAvailable.mockReturnValue(true);
		rateLimited.mockResolvedValue(false);
	});

	it("a stored read comes back without counting against the hourly reads", async () => {
		givenScore({ chartRead: READ });
		aiDetect.readChartOfScore.mockResolvedValue({ text: READ, fromModel: false });
		await expect(call(files.readChartOfFile, { id: FILE })).resolves.toMatchObject({
			text: READ,
			edited: false,
			fromModel: false,
		});
		expect(rateLimited).not.toHaveBeenCalled();
	});

	it("without one, the model reads the file (stored by readChartOfScore), a few per hour", async () => {
		givenScore();
		aiDetect.readChartOfScore.mockResolvedValue({ text: READ, fromModel: true });
		await expect(call(files.readChartOfFile, { id: FILE })).resolves.toEqual({
			text: READ,
			edited: false,
			fromModel: true,
			warnings: [],
		});
		expect(rateLimited).toHaveBeenCalledWith(`chart-read:${USER}`, 10, 3_600_000);
		expect(aiDetect.readChartOfScore).toHaveBeenCalledWith(
			{ fileId: FILE, url: "https://blob/score.pdf", filename: "score.pdf", chartRead: null },
			{ userId: USER, songId: SONG, accountId: ACCOUNT },
		);
	});

	it("429 over the hourly reads, 503 without the gateway, 502 when the model fails", async () => {
		givenScore();
		rateLimited.mockResolvedValue(true);
		await expect(call(files.readChartOfFile, { id: FILE })).rejects.toMatchObject(httpError(429));
		rateLimited.mockResolvedValue(false);
		aiDetect.aiAvailable.mockReturnValue(false);
		await expect(call(files.readChartOfFile, { id: FILE })).rejects.toMatchObject(httpError(503));
		expect(aiDetect.readChartOfScore).not.toHaveBeenCalled();
		aiDetect.aiAvailable.mockReturnValue(true);
		aiDetect.readChartOfScore.mockRejectedValue(new Error("The model did not summarize the chart"));
		await expect(call(files.readChartOfFile, { id: FILE })).rejects.toMatchObject({
			status: 502,
			body: { message: "The model did not summarize the chart" },
		});
	});

	it("403 when the song or its project opted out of AI; 404 for a file that is not a score", async () => {
		givenScore({ chartRead: READ }, { project: { noAi: true } });
		await expect(call(files.readChartOfFile, { id: FILE })).rejects.toMatchObject(httpError(403));
		givenScore({ chartRead: READ }, { noAi: true });
		await expect(call(files.readChartOfFile, { id: FILE })).rejects.toMatchObject(httpError(403));
		data.chartReadOfFile.mockResolvedValue(null);
		await expect(call(files.readChartOfFile, { id: FILE })).rejects.toMatchObject(httpError(404));
		await expect(call(files.saveChartReadOfFile, { id: FILE, text: READ })).rejects.toMatchObject(
			httpError(404),
		);
		await expect(call(files.clearChartReadOfFile, { id: FILE })).rejects.toMatchObject(
			httpError(404),
		);
		expect(aiDetect.readChartOfScore).not.toHaveBeenCalled();
		expect(data.saveChartRead).not.toHaveBeenCalled();
	});

	it("a saved read needs its measure lines, and is marked edited", async () => {
		givenScore();
		data.saveChartRead.mockResolvedValue({ chartRead: READ, chartReadEdited: true });
		await expect(
			call(files.saveChartReadOfFile, { id: FILE, text: "Title: Song\nkey C major" }),
		).rejects.toMatchObject({
			status: 400,
			body: { message: "A read has one line per measure, starting m1, m2, …" },
		});
		expect(data.saveChartRead).not.toHaveBeenCalled();
		const warned = "m1 key E major 4/4: E\nm2: A\nm3: B\nm4: C\nm5: A\nm6: G\nm7: E\nm8: A\nm9: B";
		await expect(
			call(files.saveChartReadOfFile, { id: FILE, text: warned }),
		).resolves.toMatchObject({ text: warned, edited: true, warnings: [expect.any(String)] });
		expect(data.saveChartRead).toHaveBeenCalledWith(ACCOUNT, FILE, warned, true);
	});

	it("a cleared read leaves the row and the Redis cache", async () => {
		givenScore({ chartRead: READ, chartReadEdited: true });
		data.saveChartRead.mockResolvedValue({ chartRead: null, chartReadEdited: false });
		aiDetect.chartCacheKey.mockReturnValue("chart:abc");
		redis.redisConfigured.mockReturnValue(true);
		await expect(call(files.clearChartReadOfFile, { id: FILE })).resolves.toEqual({
			cleared: true,
		});
		expect(data.saveChartRead).toHaveBeenCalledWith(ACCOUNT, FILE, null, false);
		expect(aiDetect.chartCacheKey).toHaveBeenCalledWith("https://blob/score.pdf");
		expect(redis.redisPipeline).toHaveBeenCalledWith([["DEL", "chart:abc"]]);
	});
});
