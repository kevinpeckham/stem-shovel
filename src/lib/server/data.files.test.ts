import { MAX_DEMOS_PER_SONG } from "$lib/constants/demoFormats";
import { MAX_FILES_PER_PROJECT, MAX_FILES_PER_SONG } from "$lib/constants/fileFormats";
import { MAX_NOTATION_PER_SONG } from "$lib/constants/notationFormats";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { blob, callsTo, fake, reset } from "../../../tests/helpers/fakeDataLayer";

const {
	attachFile,
	claimDemoPlayback,
	createDemo,
	createDemoFromFile,
	createFile,
	createNotation,
	deleteDemo,
	deleteFile,
	deleteNotation,
	demosWantingPlayback,
	failDemoPlayback,
	failFile,
	failNotation,
	fileByShareCode,
	findFileById,
	finishDemoPlayback,
	listProjectFiles,
	listProjectScores,
	markDemoReady,
	markFileReady,
	markNotationReady,
	markStemMidiReady,
	projectForDocumentation,
	recordDemoUrl,
	recordFileUrl,
	recordNotationUrl,
	recordStemMidiUrl,
	removeStemMidi,
	reserveStemMidi,
	setNotationPdf,
	songForDocumentation,
	songMentionSources,
	updateFile,
	updateNotation,
} = await import("./data");

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const MINUTE = 60_000;
const at = (ms: number) => new Date(ms);
const row = (table: Parameters<typeof fake.rows>[0], id: string) =>
	fake.rows(table).find((r) => r.id === id);

/** Project p1 in a1 with songs sg1 (active) and sg2 (archived); project p2 in a2 with song sg3. */
const base = (overrides: { songIsPrivate?: boolean; projectIsPrivate?: boolean } = {}) => ({
	project: [
		{
			id: "p1",
			accountId: "a1",
			name: "Record",
			slug: "record",
			isPrivate: overrides.projectIsPrivate ?? false,
			isRestricted: false,
			status: "active",
		},
		{
			id: "p2",
			accountId: "a2",
			name: "Other",
			slug: "other",
			isPrivate: false,
			isRestricted: false,
			status: "active",
		},
	],
	song: [
		{
			id: "sg1",
			accountId: "a1",
			projectId: "p1",
			title: "One",
			slug: "one",
			status: "active",
			isPrivate: overrides.songIsPrivate ?? false,
			sortOrder: 1,
			version: "1.0.0",
			lyricsMarkdown: "",
			chartMarkdown: "",
			notesMarkdown: "",
		},
		{
			id: "sg2",
			accountId: "a1",
			projectId: "p1",
			title: "Two",
			slug: "two",
			status: "archived",
			isPrivate: false,
			sortOrder: 0,
			version: "1.0.0",
			lyricsMarkdown: "",
			chartMarkdown: "",
			notesMarkdown: "",
		},
		{
			id: "sg3",
			accountId: "a2",
			projectId: "p2",
			title: "Three",
			slug: "three",
			status: "active",
			isPrivate: false,
			sortOrder: 0,
			version: "1.0.0",
			lyricsMarkdown: "",
			chartMarkdown: "",
			notesMarkdown: "",
		},
	],
});
/** A ready attachment of song sg1 in project p1 (a1). */
const file = (id: string, extra: Record<string, unknown> = {}) => ({
	id,
	accountId: "a1",
	projectId: "p1",
	songId: "sg1",
	kind: "pdf",
	title: id,
	description: "",
	status: "ready",
	url: `https://b/${id}.pdf`,
	pathname: `accounts/a1/songs/sg1/files/${id}.pdf`,
	filename: `${id}.pdf`,
	sizeBytes: 10,
	pageCount: 2,
	isNotation: false,
	thumbnailUrl: null,
	thumbnailPathname: null,
	shareCode: `code-${id}`,
	uploadedBy: "u1",
	createdAt: at(NOW),
	...extra,
});
/** A ready notation file of song sg1 (a1). */
const notation = (id: string, extra: Record<string, unknown> = {}) => ({
	id,
	accountId: "a1",
	songId: "sg1",
	title: id,
	description: "",
	format: "mxl",
	status: "ready",
	url: `https://b/${id}.mxl`,
	pathname: `accounts/a1/songs/sg1/notation/${id}.mxl`,
	filename: `${id}.mxl`,
	contentType: "application/vnd.recordare.musicxml",
	sizeBytes: 10,
	pageCount: 1,
	thumbnailUrl: null,
	thumbnailPathname: null,
	pdfUrl: null,
	pdfPathname: null,
	pdfStatus: null,
	shareCode: `code-${id}`,
	createdAt: at(NOW),
	...extra,
});
/** A ready demo of song sg1 (a1). */
const demo = (id: string, extra: Record<string, unknown> = {}) => ({
	id,
	accountId: "a1",
	songId: "sg1",
	label: id,
	status: "ready",
	url: `https://b/${id}.m4a`,
	pathname: `accounts/a1/songs/sg1/demos/${id}.m4a`,
	filename: `${id}.m4a`,
	contentType: "audio/mp4",
	sizeBytes: 10,
	playbackStatus: null,
	playbackUrl: null,
	playbackPathname: null,
	playbackBytes: null,
	playbackStartedAt: null,
	...extra,
});
const stem = (id: string, extra: Record<string, unknown> = {}) => ({
	id,
	accountId: "a1",
	songId: "sg1",
	midiUrl: null,
	midiPathname: null,
	midiFilename: null,
	midiSizeBytes: null,
	...extra,
});
const upload = { filename: "Chart.pdf", sizeBytes: 10, kind: "pdf" as const };

beforeAll(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => reset());

describe("createFile", () => {
	test("a song-level file goes under the song, titled from its name, a score when asked", async () => {
		reset(base());
		const made = await createFile({
			accountId: "a1",
			userId: "u1",
			projectId: "p1",
			songId: "sg1",
			isNotation: true,
			...upload,
		});
		const id = (made as { id: string }).id;
		expect(row("songFile", id)).toMatchObject({
			accountId: "a1",
			projectId: "p1",
			songId: "sg1",
			kind: "pdf",
			title: "Chart",
			isNotation: true,
			status: "uploading",
			url: "",
			pathname: `accounts/a1/songs/sg1/files/${id}.pdf`,
			filename: "Chart.pdf",
			sizeBytes: 10,
			uploadedBy: "u1",
		});
		expect(row("songFile", id)?.shareCode).toHaveLength(16);
	});
	test("a project-level file goes under the project and is never a score", async () => {
		reset(base());
		const made = await createFile({
			accountId: "a1",
			userId: "u1",
			projectId: "p1",
			songId: null,
			isNotation: true,
			...upload,
			filename: "cover.png",
			kind: "image",
		});
		const id = (made as { id: string }).id;
		expect(row("songFile", id)).toMatchObject({
			songId: null,
			kind: "image",
			title: "cover",
			isNotation: false,
			pathname: `accounts/a1/projects/p1/files/${id}.png`,
		});
	});
	test("null for another account's project or a song outside it; full at each cap, counted apart", async () => {
		reset({
			...base(),
			songFile: [
				...Array.from({ length: MAX_FILES_PER_SONG }, (_, i) => file(`s${i}`)),
				...Array.from({ length: MAX_FILES_PER_PROJECT }, (_, i) => file(`p${i}`, { songId: null })),
			],
		});
		const input = { accountId: "a1", userId: "u1", projectId: "p1", ...upload };
		expect(await createFile({ ...input, projectId: "p2", songId: null })).toBeNull();
		expect(await createFile({ ...input, songId: "sg3" })).toBeNull();
		expect(await createFile({ ...input, songId: "sg1" })).toBe("full");
		expect(await createFile({ ...input, songId: null })).toBe("full");
		// The archived song has no files: the project's own files do not count against it.
		expect(await createFile({ ...input, songId: "sg2" })).toMatchObject({ songId: "sg2" });
	});
});

describe("attachFile", () => {
	test("moves a file between the project level and a song of its project; a file leaving a song stops being a score", async () => {
		reset({
			...base(),
			songFile: [file("f1", { isNotation: true }), file("f2", { songId: null })],
		});
		expect(await attachFile("a1", "f1", null)).toMatchObject({
			id: "f1",
			songId: null,
			isNotation: false,
		});
		expect(await attachFile("a1", "f2", "sg2")).toMatchObject({
			id: "f2",
			songId: "sg2",
			isNotation: false,
		});
		expect(row("songFile", "f1")).toMatchObject({ songId: null, isNotation: false });
		expect(row("songFile", "f2")?.songId).toBe("sg2");
	});
	test("the same target is a no-op; null for an unknown file or a song outside the project; full when the target is", async () => {
		reset({
			...base(),
			songFile: [
				file("f1"),
				...Array.from({ length: MAX_FILES_PER_SONG }, (_, i) => file(`s${i}`, { songId: "sg2" })),
			],
		});
		expect(await attachFile("a1", "f1", "sg1")).toMatchObject({ id: "f1", songId: "sg1" });
		expect(callsTo("update", "song_file")).toEqual([]);
		expect(await attachFile("a2", "f1", null)).toBeNull();
		expect(await attachFile("a1", "f1", "sg3")).toBeNull();
		expect(await attachFile("a1", "f1", "sg2")).toBe("full");
	});
});

describe("listProjectFiles / listProjectScores", () => {
	test("the project's ready files newest first, each with its song or null, URLs presented", async () => {
		reset({
			...base(),
			songFile: [
				file("f1", { createdAt: at(NOW - MINUTE), thumbnailUrl: "https://b/f1-thumb.png" }),
				file("f2", { songId: null, createdAt: at(NOW) }),
				file("f3", { status: "uploading" }),
				file("f4", { accountId: "a2", projectId: "p2", songId: "sg3" }),
			],
		});
		const files = await listProjectFiles("a1", "p1");
		expect(files.map((f) => [f.id, f.song])).toEqual([
			["f2", null],
			["f1", { id: "sg1", title: "One", slug: "one" }],
		]);
		expect(files[1]).toMatchObject({
			url: "https://b/f1.pdf",
			thumbnailUrl: "https://b/f1-thumb.png",
		});
		expect(blob.presentUrl).toHaveBeenCalledWith("https://b/f1-thumb.png");
	});
	test("the scores of the project's active songs, newest first, the PDF's URL only once rendered; nothing without active songs", async () => {
		reset({
			...base(),
			songNotation: [
				notation("n1", {
					createdAt: at(NOW - MINUTE),
					pdfStatus: "ready",
					pdfUrl: "https://b/n1.pdf",
				}),
				notation("n2", { createdAt: at(NOW), pdfStatus: "pending" }),
				notation("n3", { songId: "sg2" }),
				notation("n4", { status: "uploading" }),
			],
		});
		const scores = await listProjectScores("a1", "p1");
		expect(scores.map((n) => [n.id, n.song?.slug, n.pdfUrl])).toEqual([
			["n2", "one", null],
			["n1", "one", "https://b/n1.pdf"],
		]);
		expect(await listProjectScores("a2", "p2")).toEqual([]);
	});
});

describe("songForDocumentation / projectForDocumentation", () => {
	test("an active song with its project, ready notation and the files marked as notation, in upload order", async () => {
		reset({
			...base(),
			songNotation: [
				notation("n2", { createdAt: at(NOW), pdfStatus: "ready", pdfUrl: "https://b/n2.pdf" }),
				notation("n1", { createdAt: at(NOW - MINUTE) }),
				notation("n3", { status: "uploading" }),
			],
			songFile: [
				file("f1", { isNotation: true }),
				file("f2"),
				file("f3", { isNotation: true, status: "uploading" }),
			],
		});
		const s = await songForDocumentation("sg1");
		expect(s).toMatchObject({
			id: "sg1",
			title: "One",
			project: { name: "Record", isPrivate: false, isRestricted: false },
		});
		expect(s?.notation).toEqual([
			{ id: "n1", pdfUrl: null, pdfStatus: null },
			{ id: "n2", pdfUrl: "https://b/n2.pdf", pdfStatus: "ready" },
		]);
		expect(s?.files).toEqual([
			{ id: "f1", url: "https://b/f1.pdf", kind: "pdf", filename: "f1.pdf" },
		]);
		expect(await songForDocumentation("sg2")).toBeNull();
	});
	test("the project with its active songs in page order, each with its scores; null for another account", async () => {
		reset({
			...base(),
			song: [
				...base().song,
				{ ...base().song[0], id: "sg4", title: "Aardvark", slug: "aardvark", sortOrder: 1 },
			],
			songNotation: [notation("n1"), notation("n2", { songId: "sg4" })],
			songFile: [file("f1", { isNotation: true }), file("f2")],
		});
		const p = await projectForDocumentation("a1", "p1");
		expect(p).toMatchObject({ id: "p1", name: "Record", slug: "record" });
		expect(
			p?.songs.map((s) => [s.id, s.notation.map((n) => n.id), s.files.map((f) => f.id)]),
		).toEqual([
			["sg4", ["n2"], []],
			["sg1", ["n1"], ["f1"]],
		]);
		expect(await projectForDocumentation("a2", "p1")).toBeNull();
	});
});

describe("the attachment upload lifecycle", () => {
	test("findFileById, the webhook's URL, the ready report, the failure", async () => {
		reset({
			songFile: [
				file("f1", { status: "uploading", url: "" }),
				file("f2", { url: "https://b/keep.pdf" }),
			],
		});
		expect(await findFileById("a1", "f1")).toEqual({
			pathname: "accounts/a1/songs/sg1/files/f1.pdf",
			kind: "pdf",
		});
		expect(await findFileById("a2", "f1")).toBeNull();
		await recordFileUrl("accounts/a1/songs/sg1/files/f1.pdf", "https://b/f1.pdf");
		await recordFileUrl("accounts/a1/songs/sg1/files/f2.pdf", "https://b/late.pdf");
		expect(row("songFile", "f1")).toMatchObject({ url: "https://b/f1.pdf", status: "uploading" });
		expect(row("songFile", "f2")?.url).toBe("https://b/keep.pdf");
		const data = {
			url: "https://b/f1.pdf",
			pageCount: 3,
			thumbnailUrl: "https://b/f1-thumb.png",
			thumbnailPathname: "p/f1-thumb.png",
		};
		expect(await markFileReady("a2", "f1", data)).toBeNull();
		expect(await markFileReady("a1", "f1", data)).toMatchObject({
			id: "f1",
			status: "ready",
			...data,
		});
		await failFile("a2", "f1");
		expect(blob.deleteBlobs).not.toHaveBeenCalled();
		await failFile("a1", "f1");
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://b/f1.pdf", "https://b/f1-thumb.png"]);
		expect(fake.rows("songFile").map((r) => r.id)).toEqual(["f2"]);
	});
	test("updateFile changes the words, and the score flag only when given; deleteFile takes the files along", async () => {
		reset({ songFile: [file("f1", { isNotation: true }), file("f2")] });
		expect(await updateFile("a1", "f1", { title: "T", description: "D" })).toMatchObject({
			title: "T",
			description: "D",
			isNotation: true,
		});
		expect(
			await updateFile("a1", "f1", { title: "T", description: "D", isNotation: false }),
		).toMatchObject({ isNotation: false });
		expect(await updateFile("a2", "f1", { title: "X", description: "" })).toBeNull();
		expect(row("songFile", "f1")?.title).toBe("T");
		expect(await deleteFile("a2", "f1")).toBe(false);
		expect(await deleteFile("a1", "f1")).toBe(true);
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://b/f1.pdf", ""]);
		expect(fake.rows("songFile").map((r) => r.id)).toEqual(["f2"]);
	});
	test("fileByShareCode serves ready files only, with the type their name promises", async () => {
		reset({ songFile: [file("f1"), file("f2", { status: "uploading" })] });
		expect(await fileByShareCode("code-f1")).toEqual({
			url: "https://b/f1.pdf",
			filename: "f1.pdf",
			title: "f1",
			kind: "pdf",
			contentType: "application/pdf",
		});
		expect(await fileByShareCode("code-f2")).toBeNull();
	});
});

describe("createDemoFromFile", () => {
	test("copies an audio attachment under the song's demos in the song's store as a ready demo", async () => {
		reset({
			...base({ projectIsPrivate: true }),
			songFile: [file("f1", { kind: "audio", filename: "Idea take.mp3", url: "https://b/f1.mp3" })],
		});
		const made = await createDemoFromFile("a1", "u1", "f1");
		const id = (made as { id: string }).id;
		const pathname = `accounts/a1/songs/sg1/demos/${id}.mp3`;
		expect(row("demo", id)).toMatchObject({
			accountId: "a1",
			songId: "sg1",
			label: "Idea take",
			status: "ready",
			url: `https://blob/${pathname}`,
			pathname,
			filename: "Idea take.mp3",
			contentType: "audio/mpeg",
			sizeBytes: 10,
			uploadedBy: "u1",
		});
		expect(blob.copyBlob).toHaveBeenCalledWith("https://b/f1.mp3", pathname, "private");
		expect(fake.rows("songFile")).toHaveLength(1);
	});
	test("null for a file that is not ready, not audio, project-level or another account's; full at the cap", async () => {
		reset({
			...base(),
			songFile: [
				file("f1", { kind: "audio" }),
				file("f2", { kind: "audio", status: "uploading" }),
				file("f3"),
				file("f4", { kind: "audio", songId: null }),
			],
			demo: Array.from({ length: MAX_DEMOS_PER_SONG }, (_, i) => demo(`d${i}`)),
		});
		expect(await createDemoFromFile("a1", "u1", "f2")).toBeNull();
		expect(await createDemoFromFile("a1", "u1", "f3")).toBeNull();
		expect(await createDemoFromFile("a1", "u1", "f4")).toBeNull();
		expect(await createDemoFromFile("a2", "u1", "f1")).toBeNull();
		expect(await createDemoFromFile("a1", "u1", "f1")).toBe("full");
		expect(blob.copyBlob).not.toHaveBeenCalled();
	});
});

describe("songMentionSources", () => {
	test("the song's attachments, notation files and demos, by account and song", async () => {
		reset({
			songFile: [file("f1"), file("f2", { songId: "sg2" }), file("f3", { accountId: "a2" })],
			songNotation: [notation("n1", { status: "uploading" })],
			demo: [demo("d1"), demo("d2", { songId: "sg2" })],
		});
		expect(await songMentionSources("a1", "sg1")).toEqual({
			files: [{ status: "ready", title: "f1", filename: "f1.pdf", shareCode: "code-f1" }],
			notation: [{ status: "uploading", title: "n1", filename: "n1.mxl", shareCode: "code-n1" }],
			demos: [{ id: "d1", label: "d1" }],
		});
	});
});

describe("notation files", () => {
	test("createNotation reserves the row with its format's type; null for another account's song, full at the cap", async () => {
		reset({
			...base(),
			songNotation: Array.from({ length: MAX_NOTATION_PER_SONG }, (_, i) =>
				notation(`n${i}`, { songId: "sg2" }),
			),
		});
		const made = await createNotation("a1", "u1", "sg1", {
			filename: "Lead sheet.musicxml",
			sizeBytes: 5,
			format: "musicxml",
		});
		const id = (made as { id: string }).id;
		expect(row("songNotation", id)).toMatchObject({
			accountId: "a1",
			songId: "sg1",
			title: "Lead sheet",
			format: "musicxml",
			status: "uploading",
			url: "",
			pathname: `accounts/a1/songs/sg1/notation/${id}.musicxml`,
			contentType: "application/vnd.recordare.musicxml+xml",
			sizeBytes: 5,
			uploadedBy: "u1",
		});
		expect(row("songNotation", id)?.shareCode).toHaveLength(16);
		expect(
			await createNotation("a2", "u1", "sg1", { filename: "x.mxl", sizeBytes: 5, format: "mxl" }),
		).toBeNull();
		expect(
			await createNotation("a1", "u1", "sg2", { filename: "x.mxl", sizeBytes: 5, format: "mxl" }),
		).toBe("full");
	});
	test("the webhook's URL lands on the uploading row; the ready report owes a PDF; a failure takes every file", async () => {
		reset({
			songNotation: [
				notation("n1", { status: "uploading", url: "" }),
				notation("n2", { url: "https://b/keep.mxl" }),
			],
		});
		await recordNotationUrl("accounts/a1/songs/sg1/notation/n1.mxl", "https://b/n1.mxl");
		await recordNotationUrl("accounts/a1/songs/sg1/notation/n2.mxl", "https://b/late.mxl");
		expect(row("songNotation", "n1")?.url).toBe("https://b/n1.mxl");
		expect(row("songNotation", "n2")?.url).toBe("https://b/keep.mxl");
		const data = {
			url: "https://b/n1.mxl",
			pageCount: 2,
			thumbnailUrl: "https://b/n1-thumb.png",
			thumbnailPathname: "p/n1-thumb.png",
		};
		expect(await markNotationReady("a2", "n1", data)).toBeNull();
		expect(await markNotationReady("a1", "n1", data)).toMatchObject({
			id: "n1",
			status: "ready",
			pdfStatus: "pending",
			...data,
		});
		await setNotationPdf("n1", {
			pdfUrl: "https://b/n1.pdf",
			pdfPathname: "p/n1.pdf",
			pdfStatus: "ready",
		});
		expect(row("songNotation", "n1")).toMatchObject({
			pdfUrl: "https://b/n1.pdf",
			pdfPathname: "p/n1.pdf",
			pdfStatus: "ready",
		});
		await setNotationPdf("n2", { pdfStatus: "failed" });
		expect(row("songNotation", "n2")?.pdfStatus).toBe("failed");
		await failNotation("a2", "n1");
		expect(blob.deleteBlobs).not.toHaveBeenCalled();
		await failNotation("a1", "n1");
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"https://b/n1.mxl",
			"https://b/n1-thumb.png",
			"https://b/n1.pdf",
		]);
		expect(fake.rows("songNotation").map((r) => r.id)).toEqual(["n2"]);
	});
	test("updateNotation and deleteNotation, scoped to the account", async () => {
		reset({ songNotation: [notation("n1", { pdfUrl: "https://b/n1.pdf" }), notation("n2")] });
		expect(await updateNotation("a1", "n1", { title: "T", description: "D" })).toMatchObject({
			id: "n1",
			title: "T",
			description: "D",
		});
		expect(await updateNotation("a2", "n1", { title: "X", description: "" })).toBeNull();
		expect(await deleteNotation("a2", "n1")).toBe(false);
		expect(await deleteNotation("a1", "n1")).toBe(true);
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://b/n1.mxl", "", "https://b/n1.pdf"]);
		expect(fake.rows("songNotation").map((r) => r.id)).toEqual(["n2"]);
	});
});

describe("demos", () => {
	test("createDemo reserves the row labelled from the file; null for another account's song, full at the cap", async () => {
		reset({
			...base(),
			demo: Array.from({ length: MAX_DEMOS_PER_SONG }, (_, i) => demo(`d${i}`, { songId: "sg2" })),
		});
		const upload = { filename: "Voice memo.m4a", contentType: "audio/mp4", sizeBytes: 9 };
		const made = await createDemo("a1", "u1", "sg1", upload);
		const id = (made as { id: string }).id;
		expect(row("demo", id)).toMatchObject({
			accountId: "a1",
			songId: "sg1",
			label: "Voice memo",
			status: "uploading",
			url: "",
			pathname: `accounts/a1/songs/sg1/demos/${id}.m4a`,
			contentType: "audio/mp4",
			sizeBytes: 9,
			uploadedBy: "u1",
		});
		expect(await createDemo("a2", "u1", "sg1", upload)).toBeNull();
		expect(await createDemo("a1", "u1", "sg2", upload)).toBe("full");
	});
	test("the ready report and the webhook backstop ready the uploading row; deleteDemo takes the rendition along", async () => {
		reset({
			demo: [
				demo("d1", { status: "uploading", url: "" }),
				demo("d2", { status: "uploading", url: "" }),
				demo("d3", { playbackUrl: "https://b/d3.mp3" }),
			],
		});
		expect(await markDemoReady("a2", "d1", "https://b/d1.m4a")).toBeNull();
		expect(await markDemoReady("a1", "d1", "https://b/d1.m4a")).toEqual({ id: "d1" });
		expect(row("demo", "d1")).toMatchObject({ status: "ready", url: "https://b/d1.m4a" });
		await recordDemoUrl("accounts/a1/songs/sg1/demos/d2.m4a", "https://b/d2.m4a");
		await recordDemoUrl("accounts/a1/songs/sg1/demos/d3.m4a", "https://b/late.m4a");
		expect(row("demo", "d2")).toMatchObject({ status: "ready", url: "https://b/d2.m4a" });
		expect(row("demo", "d3")?.url).toBe("https://b/d3.m4a");
		expect(await deleteDemo("a2", "d3")).toBe(false);
		expect(await deleteDemo("a1", "d3")).toBe(true);
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://b/d3.m4a", "https://b/d3.mp3"]);
		expect(fake.rows("demo").map((r) => r.id)).toEqual(["d1", "d2"]);
	});
	test("the playback claim is the lock; finishing and failing record the outcome", async () => {
		reset({
			demo: [
				demo("d1"),
				demo("d2", { status: "uploading" }),
				demo("d3", { playbackStatus: "failed", playbackStartedAt: at(NOW - 61 * MINUTE) }),
			],
		});
		expect(await claimDemoPlayback("d1")).toEqual({
			id: "d1",
			url: "https://b/d1.m4a",
			pathname: "accounts/a1/songs/sg1/demos/d1.m4a",
			playbackUrl: null,
		});
		expect(row("demo", "d1")).toMatchObject({
			playbackStatus: "pending",
			playbackStartedAt: at(NOW),
		});
		expect(await claimDemoPlayback("d1")).toBeNull();
		expect(await claimDemoPlayback("d2")).toBeNull();
		expect((await claimDemoPlayback("d3"))?.id).toBe("d3");
		await finishDemoPlayback("d1", { url: "https://b/d1.mp3", pathname: "p/d1.mp3", bytes: 5 });
		expect(row("demo", "d1")).toMatchObject({
			playbackStatus: "ready",
			playbackUrl: "https://b/d1.mp3",
			playbackPathname: "p/d1.mp3",
			playbackBytes: 5,
		});
		await failDemoPlayback("d3");
		expect(row("demo", "d3")?.playbackStatus).toBe("failed");
	});
	test("demosWantingPlayback: ready demos never rendered, failed over an hour ago, or stuck pending", () => {
		const d = (
			id: string,
			playbackStatus: "ready" | "pending" | "failed" | null,
			minutesAgo = 0,
		) => ({
			id,
			status: "ready",
			url: "https://b/x",
			playbackStatus,
			playbackStartedAt: playbackStatus ? at(NOW - minutesAgo * MINUTE) : null,
		});
		expect(
			demosWantingPlayback(
				[
					d("new", null),
					d("done", "ready"),
					d("retry", "failed", 61),
					d("wait", "failed", 30),
					d("stuck", "pending", 16),
					d("busy", "pending", 5),
				],
				NOW,
			),
		).toEqual(["new", "retry", "stuck"]);
	});
});

describe("stem MIDI files", () => {
	const upload = { filename: "Bass.mid", contentType: "audio/midi", sizeBytes: 3 };
	test("reserveStemMidi keeps the previous file until the new one lands; null for another account's stem", async () => {
		reset({ stem: [stem("st1", { midiUrl: "https://b/old.mid", midiPathname: "p/old.mid" })] });
		expect(await reserveStemMidi("a1", "st1", upload)).toEqual({
			stemId: "st1",
			pathname: "accounts/a1/songs/sg1/midi/st1.mid",
			contentType: "audio/midi",
		});
		expect(row("stem", "st1")).toMatchObject({
			midiUrl: "https://b/old.mid",
			midiPathname: "accounts/a1/songs/sg1/midi/st1.mid",
			midiFilename: "Bass.mid",
			midiSizeBytes: 3,
		});
		expect(await reserveStemMidi("a2", "st1", upload)).toBeNull();
	});
	test("markStemMidiReady swaps the URL in and drops the previous file, unless it is the same", async () => {
		reset({ stem: [stem("st1", { midiUrl: "https://b/old.mid" }), stem("st2")] });
		expect(await markStemMidiReady("a2", "st1", "https://b/new.mid")).toBeNull();
		expect(await markStemMidiReady("a1", "st1", "https://b/new.mid")).toEqual({ stemId: "st1" });
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://b/old.mid"]);
		expect(await markStemMidiReady("a1", "st1", "https://b/new.mid")).toEqual({ stemId: "st1" });
		expect(await markStemMidiReady("a1", "st2", "https://b/st2.mid")).toEqual({ stemId: "st2" });
		expect(blob.deleteBlobs).toHaveBeenCalledTimes(1);
		expect(row("stem", "st2")?.midiUrl).toBe("https://b/st2.mid");
	});
	test("recordStemMidiUrl (the webhook) does the same by pathname and ignores a repeat", async () => {
		reset({
			stem: [
				stem("st1", { midiPathname: "p/st1.mid", midiUrl: "https://b/old.mid" }),
				stem("st2", { midiPathname: "p/st2.mid" }),
			],
		});
		await recordStemMidiUrl("p/none.mid", "https://b/x.mid");
		await recordStemMidiUrl("p/st1.mid", "https://b/old.mid");
		expect(callsTo("update", "stem")).toEqual([]);
		await recordStemMidiUrl("p/st1.mid", "https://b/new.mid");
		await recordStemMidiUrl("p/st2.mid", "https://b/st2.mid");
		expect(row("stem", "st1")?.midiUrl).toBe("https://b/new.mid");
		expect(row("stem", "st2")?.midiUrl).toBe("https://b/st2.mid");
		expect(blob.deleteBlobs).toHaveBeenCalledTimes(1);
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://b/old.mid"]);
	});
	test("removeStemMidi clears the file and the row", async () => {
		reset({
			stem: [
				stem("st1", {
					midiUrl: "https://b/old.mid",
					midiPathname: "p",
					midiFilename: "f",
					midiSizeBytes: 1,
				}),
			],
		});
		expect(await removeStemMidi("a2", "st1")).toBe(false);
		expect(await removeStemMidi("a1", "st1")).toBe(true);
		expect(row("stem", "st1")).toMatchObject({
			midiUrl: null,
			midiPathname: null,
			midiFilename: null,
			midiSizeBytes: null,
		});
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://b/old.mid"]);
	});
});
