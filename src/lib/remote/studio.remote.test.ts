import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_USER,
	USER,
	asEditorOf,
	asMemberOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/**
 * Authorization of the Studio's remote functions: a song is the caller's own
 * idea (requireOwnIdea: creatorship, whichever account holds the files), and
 * only an editor of an account starts one there.
 */
const studio = await import("./studio.remote");

const IDEA = fakeId("idea-one");
const REVISION = fakeId("rev-one");
const SOURCE = fakeId("src-one");
const arrangement = {
	version: 1,
	bpm: 120,
	beatsPerBar: 4,
	gridOn: true,
	countIn: false,
	click: false,
	loop: null,
	master: 1,
	tracks: [],
	clips: [],
};

/** The song exists in ACCOUNT; `studioSongAccess` says who made it and whether the band may work on it (D7). */
function givenIdeaOwnedBy(userId: string, shared = false) {
	givenRow("idea", { accountId: ACCOUNT });
	data.studioSongAccess.mockResolvedValue({ accountId: ACCOUNT, createdBy: userId, shared });
}

beforeEach(resetRemoteMocks);

describe("importSongStems (a song's stems into a new Dawn song)", () => {
	const SONG = fakeId("song-one");
	beforeEach(() => {
		givenRow("song", { accountId: ACCOUNT, projectId: fakeId("proj-one") });
		data.importSongStemsIntoStudio.mockResolvedValue({ ideaId: IDEA, tracks: 3 });
	});
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(studio.importSongStems, { songId: SONG })).rejects.toMatchObject(
			httpError(401),
		);
	});
	it("404 for an outsider and for a viewer: the song's account must be edited", async () => {
		asOutsider();
		await expect(call(studio.importSongStems, { songId: SONG })).rejects.toMatchObject(
			httpError(404),
		);
		asViewerOf(ACCOUNT);
		await expect(call(studio.importSongStems, { songId: SONG })).rejects.toMatchObject(
			httpError(404),
		);
		expect(data.importSongStemsIntoStudio).not.toHaveBeenCalled();
	});
	it("an editor gets the new song, as themselves; a song with no stems is a 409", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(studio.importSongStems, { songId: SONG })).resolves.toEqual({
			ideaId: IDEA,
			tracks: 3,
		});
		expect(data.importSongStemsIntoStudio).toHaveBeenCalledWith(ACCOUNT, USER, SONG);
		data.importSongStemsIntoStudio.mockResolvedValue("empty");
		await expect(call(studio.importSongStems, { songId: SONG })).rejects.toMatchObject(
			httpError(409),
		);
	});
});

describe("createStudioSong", () => {
	const input = { accountId: ACCOUNT, title: "New song" };
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(studio.createStudioSong, input)).rejects.toMatchObject(httpError(401));
	});
	it("404 for a member of another account", async () => {
		asOutsider();
		await expect(call(studio.createStudioSong, input)).rejects.toMatchObject(httpError(404));
		expect(data.createIdea).not.toHaveBeenCalled();
	});
	it("404 for a viewer of the account", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(studio.createStudioSong, input)).rejects.toMatchObject(httpError(404));
	});
	it("an editor creates a song of their own in the account", async () => {
		asEditorOf(ACCOUNT);
		data.createIdea.mockResolvedValue({ id: IDEA, title: "New song" });
		await expect(call(studio.createStudioSong, input)).resolves.toEqual({
			id: IDEA,
			title: "New song",
		});
		expect(data.createIdea).toHaveBeenCalledWith(ACCOUNT, USER, "New song", "song");
	});
	it("rejects a malformed account id before any check", async () => {
		asEditorOf(ACCOUNT);
		await expect(
			call(studio.createStudioSong, { accountId: "nope!", title: "x" }),
		).rejects.toThrow();
	});
});

describe("the song's own functions (requireOwnIdea)", () => {
	const cases = [
		{
			name: "autosaveArrangement",
			fn: studio.autosaveArrangement,
			input: { ideaId: IDEA, data: arrangement },
			dataFn: "saveStudioAutosave",
			args: [ACCOUNT, USER, IDEA, arrangement, undefined],
			result: { id: REVISION, number: 2, name: null },
		},
		{
			name: "saveStudioRevision",
			fn: studio.saveStudioRevision,
			input: { ideaId: IDEA, name: "Take two", data: arrangement },
			dataFn: "saveStudioRevision",
			args: [ACCOUNT, USER, IDEA, "Take two", arrangement],
			result: { id: REVISION, number: 2, name: "Take two" },
		},
		{
			name: "studioSong",
			fn: studio.studioSong,
			input: { id: IDEA },
			dataFn: "studioSongView",
			args: [ACCOUNT, IDEA, USER],
			result: { id: IDEA, title: "Song" },
		},
	];
	for (const c of cases) {
		describe(c.name, () => {
			it("401 signed out", async () => {
				asSignedOut();
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(401));
			});
			it("404 for a member of the account who did not make the song", async () => {
				givenIdeaOwnedBy(OTHER_USER);
				asMemberOf(ACCOUNT, "admin");
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("404 for an unknown song", async () => {
				data.studioSongAccess.mockResolvedValue(null);
				asEditorOf(ACCOUNT);
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(404));
			});
			it("the maker reaches the data layer scoped by the song's account", async () => {
				givenIdeaOwnedBy(USER);
				asEditorOf(ACCOUNT);
				data[c.dataFn].mockResolvedValue(c.result);
				await expect(call(c.fn, c.input)).resolves.toEqual(c.result);
				expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
			});
		});
	}
});

describe("revisions (through the song they belong to)", () => {
	beforeEach(() => {
		data.studioRevisionOwner.mockResolvedValue({ ideaId: IDEA, accountId: ACCOUNT });
	});
	const cases = [
		{
			name: "renameStudioRevision",
			fn: studio.renameStudioRevision,
			input: { id: REVISION, name: "Mix B" },
			dataFn: "renameStudioRevision",
			args: [ACCOUNT, REVISION, "Mix B"],
			result: true,
			answer: { name: "Mix B" },
		},
		{
			name: "deleteStudioRevision",
			fn: studio.deleteStudioRevision,
			input: { id: REVISION },
			dataFn: "deleteStudioRevision",
			args: [ACCOUNT, REVISION],
			result: true,
			answer: { deleted: true },
		},
		{
			name: "restoreStudioRevision",
			fn: studio.restoreStudioRevision,
			input: { id: REVISION },
			dataFn: "restoreStudioRevision",
			args: [ACCOUNT, USER, REVISION],
			result: { data: arrangement },
			answer: { data: arrangement },
		},
	];
	for (const c of cases) {
		describe(c.name, () => {
			it("401 signed out", async () => {
				asSignedOut();
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(401));
			});
			it("404 on someone else's revision, even for an owner of the account", async () => {
				givenIdeaOwnedBy(OTHER_USER);
				asMemberOf(ACCOUNT, "owner");
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("404 for a revision that does not exist", async () => {
				data.studioRevisionOwner.mockResolvedValue(null);
				asEditorOf(ACCOUNT);
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(404));
			});
			it("the song's maker acts on it", async () => {
				givenIdeaOwnedBy(USER);
				asEditorOf(ACCOUNT);
				data[c.dataFn].mockResolvedValue(c.result);
				await expect(call(c.fn, c.input)).resolves.toEqual(c.answer);
				expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
			});
		});
	}
});

describe("deleteStudioSource", () => {
	beforeEach(() => {
		data.studioSourceOwner.mockResolvedValue({ ideaId: IDEA, accountId: ACCOUNT });
	});
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(studio.deleteStudioSource, { id: SOURCE })).rejects.toMatchObject(
			httpError(401),
		);
	});
	it("404 for another member of the account", async () => {
		givenIdeaOwnedBy(OTHER_USER);
		asEditorOf(ACCOUNT);
		await expect(call(studio.deleteStudioSource, { id: SOURCE })).rejects.toMatchObject(
			httpError(404),
		);
		expect(data.deleteStudioSource).not.toHaveBeenCalled();
	});
	it("the maker removes it, scoped by the account", async () => {
		givenIdeaOwnedBy(USER);
		asEditorOf(ACCOUNT);
		data.deleteStudioSource.mockResolvedValue(true);
		await expect(call(studio.deleteStudioSource, { id: SOURCE })).resolves.toEqual({
			deleted: true,
		});
		expect(data.deleteStudioSource).toHaveBeenCalledWith(ACCOUNT, SOURCE);
	});
});

describe("a song shared with the band (D7)", () => {
	const CREATOR = fakeId("user-three");
	it("an editor of the account works on it; a viewer and an outsider do not", async () => {
		givenIdeaOwnedBy(CREATOR, true);
		asEditorOf(ACCOUNT);
		data.saveStudioAutosave.mockResolvedValue({ id: REVISION, number: 3, unchanged: false });
		await expect(
			call(studio.autosaveArrangement, { ideaId: IDEA, data: arrangement, base: 2 }),
		).resolves.toEqual({ id: REVISION, number: 3, unchanged: false });
		expect(data.saveStudioAutosave).toHaveBeenCalledWith(ACCOUNT, USER, IDEA, arrangement, 2);
		asViewerOf(ACCOUNT);
		await expect(
			call(studio.autosaveArrangement, { ideaId: IDEA, data: arrangement }),
		).rejects.toMatchObject(httpError(404));
		asOutsider();
		await expect(
			call(studio.autosaveArrangement, { ideaId: IDEA, data: arrangement }),
		).rejects.toMatchObject(httpError(404));
	});
	it("only the creator shares or unshares, and the band hears when it opens up", async () => {
		givenIdeaOwnedBy(CREATOR, true);
		asEditorOf(ACCOUNT);
		await expect(
			call(studio.setStudioShared, { ideaId: IDEA, shared: false }),
		).rejects.toMatchObject(httpError(403));
		givenIdeaOwnedBy(USER);
		data.setStudioShared.mockResolvedValue(true);
		await expect(call(studio.setStudioShared, { ideaId: IDEA, shared: true })).resolves.toEqual({
			shared: true,
		});
		expect(data.setStudioShared).toHaveBeenCalledWith(ACCOUNT, IDEA, true);
	});
});
