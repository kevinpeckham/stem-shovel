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
import { exportMusicXml } from "@barmark/musicxml";
import { zipSync, strToU8 } from "fflate";
import {
	aiDetect,
	blob,
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

/** @barmark/midi's import, mocked: its own tests cover the reading. */
const midi = vi.hoisted(() => ({
	importMidi: vi.fn((_bytes: Uint8Array) => ({
		text: "",
		diagnostics: [] as { severity: string; code: string; message: string }[],
	})),
}));
vi.mock("@barmark/midi", () => midi);

/** Authorization of the attachment remote functions: an editor of the file's account (memberOf → accountOfFile). */
const files = await import("./files.remote");

const FILE = fakeId("file-one");
const SONG = fakeId("song-one");
const DEMO = fakeId("demo-one");
const READ = "key: C, time: 4/4\n| C | G |";
/** The attachment `midiFileForImport` finds: a ready MIDI file of SONG. */
const midiRow = (over: Record<string, unknown> = {}) => ({
	id: FILE,
	songId: SONG,
	url: "https://blob/groove.mid",
	filename: "groove.mid",
	title: "Groove",
	status: "ready",
	kind: "midi",
	...over,
});
const givenMidi = (over: Record<string, unknown> = {}) => {
	data.midiFileForImport.mockResolvedValue(midiRow(over));
	blob.readBlob.mockResolvedValue(new Response(new Uint8Array([0x4d, 0x54, 0x68, 0x64])));
};
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
	{
		name: "chartFromMidi",
		fn: files.chartFromMidi,
		input: { id: FILE },
		arrange: () => {
			givenMidi();
			midi.importMidi.mockReturnValue({ text: "", diagnostics: [] });
		},
		dataFn: "midiFileForImport",
		args: [ACCOUNT, FILE],
		outcome: { chart: "", chartHtml: "", diagnostics: [], parts: [] },
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

	it("a saved read needs a bar barmark can play, and is marked edited", async () => {
		givenScore();
		data.saveChartRead.mockResolvedValue({ chartRead: READ, chartReadEdited: true });
		const noBars = {
			status: 400,
			body: {
				message: "The read has no bars to play: write each measure between pipes, as | F | C7 |",
			},
		};
		for (const text of ["Title: Song\nkey: C", "m1 key C major 4/4: C\nm2: G"])
			await expect(call(files.saveChartReadOfFile, { id: FILE, text })).rejects.toMatchObject(
				noBars,
			);
		expect(data.saveChartRead).not.toHaveBeenCalled();
		// An error on one line is the member's to fix later: the bars around it still play.
		const withError = "key: C\n| C | G |\n| Xq7 |";
		await expect(
			call(files.saveChartReadOfFile, { id: FILE, text: withError }),
		).resolves.toMatchObject({ text: withError, edited: true });
		const warned = "key: E, time: 4/4\n| E | A | B | C |\n| A | G | E | A |\n| B |";
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

describe('"Chart from score": a MusicXML file read into a chart (chartFromScore)', () => {
	const SCORE = fakeId("score-one");
	const exported = exportMusicXml("key: C, time: 4/4\n| C | G |");
	if (!exported.ok) throw new Error("the export failed");
	const XML = exported.xml;
	/** The notation row `notationForImport` finds. */
	const givenNotation = (over: Record<string, unknown> = {}) => {
		givenRow("songNotation", { accountId: ACCOUNT, song: { projectId: fakeId("proj-one") } });
		data.notationForImport.mockResolvedValue({
			id: SCORE,
			songId: SONG,
			url: "https://blob/score.musicxml",
			format: "musicxml",
			filename: "score.musicxml",
			status: "ready",
			...over,
		});
	};
	/** The remote's answer, typed (`call` answers unknown). */
	const chartOf = (id: string, part?: string) =>
		call(files.chartFromScore, part === undefined ? { id } : { id, part }) as Promise<{
			chart: string;
			chartHtml: string;
			diagnostics: { level: "error" | "warning"; message: string }[];
			parts: string[];
			partName?: string;
		}>;
	/**
	 * A piano part of notes and no chord symbols, as another program writes it:
	 * barmark's own export reads back as note sets, so the encoder is renamed.
	 */
	const notesOnly = (() => {
		const notes = exportMusicXml("part: Piano\n| {C4 E4 G4} | {G3 B3 D4} |");
		if (!notes.ok) throw new Error("the export failed");
		return notes.xml.replace(/<software>[^<]*<\/software>/, "<software>MuseScore 4.4.0</software>");
	})();
	const served = (body: BodyInit) => blob.readBlob.mockResolvedValue(new Response(body));

	beforeEach(() => asEditorOf(ACCOUNT));

	it("an editor gets the chart, its HTML and no diagnostics for a clean file", async () => {
		givenNotation();
		served(XML);
		const r = await chartOf(SCORE);
		expect(r.chart).toMatch(/\|\s*C\s*\|\s*G\s*\|/);
		expect(r.chartHtml).not.toBe("");
		expect(r.diagnostics).toEqual([]);
		expect(r.parts).toEqual([]);
		expect(r).not.toHaveProperty("partName");
		// The file, for the chart's source line once the draft is saved.
		expect(r).toMatchObject({ id: SCORE, kind: "notation" });
		expect(data.notationForImport).toHaveBeenCalledWith(ACCOUNT, SCORE);
		expect(blob.readBlob).toHaveBeenCalledWith("https://blob/score.musicxml");
	});

	it("a compressed .mxl is unpacked first", async () => {
		givenNotation({ format: "mxl", url: "https://blob/score.mxl" });
		const container =
			'<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>';
		const mxl = zipSync({
			mimetype: [strToU8("application/vnd.recordare.musicxml"), { level: 0 }],
			"META-INF/container.xml": strToU8(container),
			"score.musicxml": strToU8(XML),
		});
		served(new Blob([mxl]));
		const r = await chartOf(SCORE);
		expect(r.chart).toMatch(/\|\s*C\s*\|\s*G\s*\|/);
	});

	it("a damaged .mxl, or a file with nothing to chart, is an empty chart with an error", async () => {
		givenNotation({ format: "mxl" });
		served("not a zip");
		const damaged = await chartOf(SCORE);
		expect(damaged).toMatchObject({ chart: "", chartHtml: "", id: SCORE, kind: "notation" });
		expect(damaged.diagnostics[0]).toMatchObject({ level: "error", message: expect.any(String) });
		givenNotation();
		served('<?xml version="1.0"?><score-partwise version="4.0"><part-list/></score-partwise>');
		const empty = await chartOf(SCORE);
		expect(empty.chart).toBe("");
		expect(empty.diagnostics.some((d) => d.level === "error")).toBe(true);
	});

	it("a score of notes without chord symbols is an empty chart that names its parts", async () => {
		givenNotation();
		served(notesOnly);
		const r = await chartOf(SCORE);
		expect(r).toMatchObject({ chart: "", chartHtml: "", parts: ["Piano"] });
		expect(r.diagnostics).toEqual([
			{ level: "error", message: "no chord symbols; these parts have notes: Piano." },
		]);
		expect(r).not.toHaveProperty("partName");
	});

	it("a part asked for is charted as note sets and echoed back", async () => {
		givenNotation();
		served(notesOnly);
		const r = await chartOf(SCORE, "Piano");
		expect(r.chart).toMatch(/\|\s*\{C4 E4 G4\}\s*\|\s*\{G3 B3 D4\}\s*\|/);
		expect(r.chartHtml).not.toBe("");
		expect(r).toMatchObject({ diagnostics: [], parts: [], partName: "Piano" });
	});

	it("an unknown part is an empty chart with the importer's error and no parts", async () => {
		givenNotation();
		served(notesOnly);
		const r = await chartOf(SCORE, "Tuba");
		expect(r).toMatchObject({ chart: "", parts: [], partName: "Tuba" });
		expect(r.diagnostics.some((d) => d.level === "error")).toBe(true);
	});

	it("a part name over 80 characters is refused", async () => {
		givenNotation();
		served(notesOnly);
		await expect(chartOf(SCORE, "x".repeat(81))).rejects.toMatchObject({ name: "ValiError" });
		expect(data.notationForImport).not.toHaveBeenCalled();
	});

	it("404 for a viewer, an unknown id or a file not ready; 502 when Blob fails; 413 over 20 MB", async () => {
		givenNotation();
		asViewerOf(ACCOUNT);
		await expect(call(files.chartFromScore, { id: SCORE })).rejects.toMatchObject(httpError(404));
		expect(data.notationForImport).not.toHaveBeenCalled();
		asEditorOf(ACCOUNT);
		givenRow("songNotation", null);
		await expect(call(files.chartFromScore, { id: SCORE })).rejects.toMatchObject(httpError(404));
		givenNotation({ status: "uploading" });
		await expect(call(files.chartFromScore, { id: SCORE })).rejects.toMatchObject(httpError(404));
		givenNotation();
		data.notationForImport.mockResolvedValue(null);
		await expect(call(files.chartFromScore, { id: SCORE })).rejects.toMatchObject(httpError(404));
		givenNotation();
		blob.readBlob.mockResolvedValue(new Response(null, { status: 404 }));
		await expect(call(files.chartFromScore, { id: SCORE })).rejects.toMatchObject({
			status: 502,
			body: { message: "The score could not be read" },
		});
		blob.readBlob.mockResolvedValue(
			new Response("x", { headers: { "content-length": String(21 * 1024 * 1024) } }),
		);
		await expect(call(files.chartFromScore, { id: SCORE })).rejects.toMatchObject(httpError(413));
	});

	it("401 signed out", async () => {
		asSignedOut();
		givenNotation();
		await expect(call(files.chartFromScore, { id: SCORE })).rejects.toMatchObject(httpError(401));
	});
});

describe('"Chart from MIDI": a MIDI attachment read into a chart (chartFromMidi)', () => {
	/** The remote's answer, typed (`call` answers unknown). */
	const chartOf = () =>
		call(files.chartFromMidi, { id: FILE }) as Promise<{
			chart: string;
			chartHtml: string;
			diagnostics: { level: "error" | "warning"; message: string }[];
			parts: string[];
		}>;

	beforeEach(() => asEditorOf(ACCOUNT));

	it("an editor gets the import's chart and its HTML, read from the file's bytes", async () => {
		givenMidi();
		midi.importMidi.mockReturnValue({ text: "key: C, time: 4/4\n| C | G |", diagnostics: [] });
		const r = await chartOf();
		expect(r.chart).toBe("key: C, time: 4/4\n| C | G |");
		expect(r.chartHtml).not.toBe("");
		expect(r).toMatchObject({ diagnostics: [], parts: [] });
		expect(blob.readBlob).toHaveBeenCalledWith("https://blob/groove.mid");
		const bytes = midi.importMidi.mock.calls[0][0];
		expect(Array.from(bytes)).toEqual([0x4d, 0x54, 0x68, 0x64]);
	});

	it("errors and warnings reach the card as they are; info notes are left out", async () => {
		givenMidi();
		midi.importMidi.mockReturnValue({
			text: "",
			diagnostics: [
				{ severity: "error", code: "no-notes", message: "The file has no notes." },
				{ severity: "warning", code: "tempo-ramp", message: "A tempo ramp was flattened." },
				{ severity: "info", code: "drums-left-out", message: "The drums were left out." },
			],
		});
		const r = await chartOf();
		expect(r).toMatchObject({ chart: "", chartHtml: "", parts: [] });
		expect(r.diagnostics).toEqual([
			{ level: "error", message: "The file has no notes." },
			{ level: "warning", message: "A tempo ramp was flattened." },
		]);
	});

	it("404 for a file that is not MIDI or not ready, or not found in the account", async () => {
		for (const over of [{ kind: "pdf" }, { kind: "audio" }, { status: "uploading" }]) {
			givenMidi(over);
			await expect(chartOf()).rejects.toMatchObject({
				status: 404,
				body: { message: "MIDI file not found" },
			});
		}
		data.midiFileForImport.mockResolvedValue(null);
		await expect(chartOf()).rejects.toMatchObject(httpError(404));
		expect(midi.importMidi).not.toHaveBeenCalled();
	});

	it("shares the score's Blob read: 502 when Blob fails, 413 over 20 MB", async () => {
		givenMidi();
		blob.readBlob.mockResolvedValue(new Response(null, { status: 404 }));
		await expect(chartOf()).rejects.toMatchObject({
			status: 502,
			body: { message: "The MIDI file could not be read" },
		});
		blob.readBlob.mockRejectedValue(new Error("down"));
		await expect(chartOf()).rejects.toMatchObject(httpError(502));
		blob.readBlob.mockResolvedValue(
			new Response("x", { headers: { "content-length": String(21 * 1024 * 1024) } }),
		);
		await expect(chartOf()).rejects.toMatchObject({
			status: 413,
			body: { message: "The MIDI file is too large to chart" },
		});
		expect(midi.importMidi).not.toHaveBeenCalled();
	});
});
