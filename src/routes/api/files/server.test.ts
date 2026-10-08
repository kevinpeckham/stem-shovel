import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asAdminOf,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	fakeId,
	httpError,
} from "../../../../tests/helpers/fakeRequestEvent";
import {
	background,
	data,
	givenRow,
	notifications,
	resetRemoteMocks,
	type Mocks,
} from "../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../tests/helpers/fakeApiEvent";
import {
	FILE_MAX_BYTES,
	MAX_FILES_PER_PROJECT,
	MAX_FILES_PER_SONG,
} from "#lib/constants/fileFormats.js";

/**
 * Step 1 of an attachment upload: an editor reserves the row under a song
 * (its project follows) or a project's own library; the kind comes from the
 * extension and sets the size ceiling.
 */
const { POST } = await import("./+server");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const FILE = fakeId("file-one");
const body = { songId: SONG, filename: "Chart.pdf", sizeBytes: 300_000 };
const projectBody = { projectId: PROJECT, filename: "notes.txt", sizeBytes: 2_000 };
const row = {
	id: FILE,
	pathname: `accounts/${ACCOUNT}/songs/${SONG}/files/${FILE}.pdf`,
	kind: "pdf",
	shareCode: "abcdefghijklmnop",
};
const projectRow = {
	id: FILE,
	pathname: `accounts/${ACCOUNT}/projects/${PROJECT}/files/${FILE}.txt`,
	kind: "text",
};
const post = (b: unknown = body, locals = asEditorOf(ACCOUNT)) =>
	callRoute(POST, locals, jsonPost("/api/files", b));
/** The relocate module is auto-mocked by fakeServerModules; `accessOfPathname` answers the store a reservation goes to. */
const relocate = (await import("#lib/server/relocate.js")) as unknown as Mocks;

beforeEach(() => {
	resetRemoteMocks();
	givenRow("song", { accountId: ACCOUNT, projectId: PROJECT });
	givenRow("project", { accountId: ACCOUNT });
	data.projectOfSong.mockResolvedValue({ projectId: PROJECT });
	data.storageRoom.mockResolvedValue({ ok: true });
	data.createFile.mockResolvedValue(row);
	relocate.accessOfPathname.mockResolvedValue("public");
});

describe("POST /api/files", () => {
	it("401 signed out, 404 for an outsider and for a viewer", async () => {
		await expect(post(body, asSignedOut())).rejects.toMatchObject(httpError(401));
		await expect(post(body, asOutsider())).rejects.toMatchObject(httpError(404));
		await expect(post(body, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
		await expect(post(projectBody, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
		expect(data.createFile).not.toHaveBeenCalled();
	});
	it("400 without a songId or projectId, a filename or a numeric sizeBytes", async () => {
		await expect(post({ filename: "a.pdf", sizeBytes: 1 })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, filename: "" })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: "300000" })).rejects.toMatchObject(httpError(400));
	});
	it("400 for an empty file", async () => {
		await expect(post({ ...body, sizeBytes: 0 })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: -1 })).rejects.toMatchObject(httpError(400));
	});
	it("413 over the ceiling of the file's kind, which the extension decides", async () => {
		await expect(post({ ...body, sizeBytes: FILE_MAX_BYTES.pdf + 1 })).rejects.toMatchObject({
			status: 413,
			body: { message: expect.stringContaining("PDF") },
		});
		await expect(
			post({ ...body, filename: "memo.txt", sizeBytes: FILE_MAX_BYTES.text + 1 }),
		).rejects.toMatchObject(httpError(413));
		await expect(
			post({ ...body, filename: "song.mid", sizeBytes: FILE_MAX_BYTES.midi + 1 }),
		).rejects.toMatchObject(httpError(413));
		await expect(
			post({ ...body, filename: "mystery.bin", sizeBytes: FILE_MAX_BYTES.other + 1 }),
		).rejects.toMatchObject({ status: 413, body: { message: expect.stringContaining("A file") } });
		expect(data.createFile).not.toHaveBeenCalled();
	});
	it("a size within the ceiling of its own kind passes where another kind's would not", async () => {
		const res = await post({ ...body, filename: "mix.wav", sizeBytes: FILE_MAX_BYTES.audio });
		expect(res.status).toBe(200);
		expect(data.createFile).toHaveBeenCalledWith(expect.objectContaining({ kind: "audio" }));
	});
	it("404 for an unknown song or project", async () => {
		givenRow("song", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
		givenRow("project", null);
		await expect(post(projectBody)).rejects.toMatchObject(httpError(404));
	});
	it("404 when the song's project is not found in the account", async () => {
		data.projectOfSong.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
		expect(data.projectOfSong).toHaveBeenCalledWith(ACCOUNT, SONG);
		expect(data.storageRoom).not.toHaveBeenCalled();
	});
	it("409 when the account's storage is full", async () => {
		data.storageRoom.mockResolvedValue({ ok: false, used: 1, limit: 1 });
		await expect(post()).rejects.toMatchObject(httpError(409));
		expect(data.storageRoom).toHaveBeenCalledWith(ACCOUNT, 300_000);
		expect(data.createFile).not.toHaveBeenCalled();
	});
	it(`409 "full" at ${MAX_FILES_PER_SONG} attachments on a song, ${MAX_FILES_PER_PROJECT} on a project`, async () => {
		data.createFile.mockResolvedValue("full");
		await expect(post()).rejects.toMatchObject({
			status: 409,
			body: { message: expect.stringContaining(String(MAX_FILES_PER_SONG)) },
		});
		await expect(post(projectBody)).rejects.toMatchObject({
			status: 409,
			body: { message: expect.stringContaining(String(MAX_FILES_PER_PROJECT)) },
		});
	});
	it("404 when the data layer finds no song or project", async () => {
		data.createFile.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
		await expect(post(projectBody)).rejects.toMatchObject(httpError(404));
	});
	it("an editor reserves a song's file under its project and learns where to upload", async () => {
		const res = await post();
		expect(await res.json()).toEqual({
			fileId: FILE,
			pathname: row.pathname,
			access: "public",
			kind: "pdf",
		});
		expect(data.createFile).toHaveBeenCalledWith({
			accountId: ACCOUNT,
			userId: USER,
			projectId: PROJECT,
			songId: SONG,
			filename: "Chart.pdf",
			sizeBytes: 300_000,
			kind: "pdf",
			isNotation: false,
		});
		expect(relocate.accessOfPathname).toHaveBeenCalledWith(row.pathname);
		expect(background).toHaveBeenCalledTimes(1);
		await (background.mock.calls[0][0] as () => Promise<void>)();
		expect(notifications.checkStorage).toHaveBeenCalledWith(ACCOUNT);
	});
	it("`notation` marks a song's PDF or image as a score, and nothing else", async () => {
		await post({ ...body, notation: true });
		expect(data.createFile).toHaveBeenLastCalledWith(expect.objectContaining({ isNotation: true }));
		await post({ ...body, filename: "page.png", notation: true });
		expect(data.createFile).toHaveBeenLastCalledWith(
			expect.objectContaining({ kind: "image", isNotation: true }),
		);
		await post({ ...body, filename: "mix.mp3", notation: true });
		expect(data.createFile).toHaveBeenLastCalledWith(
			expect.objectContaining({ kind: "audio", isNotation: false }),
		);
		await post({ ...body, notation: "yes" });
		expect(data.createFile).toHaveBeenLastCalledWith(
			expect.objectContaining({ isNotation: false }),
		);
	});
	it("with projectId alone the file is the project's own: no song lookup, never a score", async () => {
		data.createFile.mockResolvedValue(projectRow);
		relocate.accessOfPathname.mockResolvedValue("private");
		const res = await post({ ...projectBody, notation: true });
		expect(await res.json()).toEqual({
			fileId: FILE,
			pathname: projectRow.pathname,
			access: "private",
			kind: "text",
		});
		expect(data.projectOfSong).not.toHaveBeenCalled();
		expect(data.createFile).toHaveBeenCalledWith({
			accountId: ACCOUNT,
			userId: USER,
			projectId: PROJECT,
			songId: null,
			filename: "notes.txt",
			sizeBytes: 2_000,
			kind: "text",
			isNotation: false,
		});
	});
	it("songId wins when both are sent: the project comes from the song, not the body", async () => {
		const OTHER_PROJECT = fakeId("proj-two");
		await post({ ...body, projectId: OTHER_PROJECT });
		expect(data.projectOfSong).toHaveBeenCalledWith(ACCOUNT, SONG);
		expect(data.createFile).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: PROJECT, songId: SONG }),
		);
	});
	it("an admin passes without the project lookup", async () => {
		const res = await post(body, asAdminOf(ACCOUNT));
		expect(res.status).toBe(200);
	});
});
