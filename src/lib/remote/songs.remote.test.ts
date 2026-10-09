import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asAdminOf,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	call,
	fakeId,
	httpError,
	redirected,
} from "../../../tests/helpers/fakeRequestEvent";
import {
	aiDetect,
	data,
	email,
	givenRow,
	jobs,
	resetRemoteMocks,
} from "../../../tests/helpers/fakeServerModules";

/**
 * Authorization of the song remote functions: every mutation finds the
 * entity's account (song, stem, demo, credit or project) and needs an
 * editor there (memberOf → requireEditor), never trusting an account from
 * the request; the private note goes by who may view the song.
 */
const songs = await import("./songs.remote");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const STEM = fakeId("stem-one");
const DEMO = fakeId("demo-one");
const CREDIT = fakeId("credit-one");
const SLUGS = { account: "band", project: "album", song: "track" };

/** The rows access.ts finds, each pointing back to ACCOUNT and the song's project. */
function givenRows() {
	givenRow("song", { accountId: ACCOUNT, projectId: PROJECT });
	givenRow("project", { accountId: ACCOUNT });
	givenRow("stem", { accountId: ACCOUNT, song: { projectId: PROJECT } });
	givenRow("demo", { accountId: ACCOUNT, song: { projectId: PROJECT } });
	givenRow("songCredit", { song: { accountId: ACCOUNT, projectId: PROJECT } });
	data.songSlugs.mockResolvedValue(SLUGS);
	data.projectSlugs.mockResolvedValue(SLUGS);
}

interface Case {
	name: string;
	fn: object;
	input: unknown;
	/** 404 from memberOf; 401 where requireUser comes first. */
	anon?: number;
	arrange?: () => unknown;
	/** The data function that must be reached, with the account first. */
	dataFn: string;
	args: unknown[];
	/** The answer, or the redirect thrown on success. */
	outcome: unknown;
}

beforeEach(() => {
	resetRemoteMocks();
	givenRows();
});

describe("editor-gated functions", () => {
	const cases: Case[] = [
		{
			name: "updateSong",
			fn: songs.updateSong,
			input: { id: SONG, title: "Track", slug: "track" },
			arrange: () => data.updateSong.mockResolvedValue({ ok: true }),
			dataFn: "updateSong",
			args: [ACCOUNT, SONG, expect.objectContaining({ title: "Track", slug: "track" })],
			outcome: redirected("/band/projects/album/track"),
		},
		{
			name: "saveDoc (a shared document)",
			fn: songs.saveDoc,
			input: { songId: SONG, kind: "chart", markdown: "# C" },
			arrange: () => data.saveSongDoc.mockResolvedValue({ ok: true, version: 2, changed: true }),
			dataFn: "saveSongDoc",
			args: [ACCOUNT, USER, SONG, "chart", "# C", { confirmEmpty: false }],
			outcome: { version: 2, changed: true, html: "<p># C</p>" },
		},
		{
			name: "createSong",
			fn: songs.createSong,
			input: { projectId: PROJECT, title: "New" },
			arrange: () => data.createSong.mockResolvedValue({ id: SONG, slug: "new" }),
			dataFn: "createSong",
			args: [ACCOUNT, USER, PROJECT, "New"],
			outcome: redirected("/band/projects/album/new"),
		},
		{
			name: "deleteSong",
			fn: songs.deleteSong,
			input: { id: SONG },
			dataFn: "deleteSong",
			args: [ACCOUNT, SONG],
			outcome: redirected("/band/projects/album"),
		},
		{
			name: "removeStems",
			fn: songs.removeStems,
			input: { ids: [STEM] },
			arrange: () => data.deleteStem.mockResolvedValue({ songId: SONG }),
			dataFn: "deleteStem",
			args: [ACCOUNT, STEM],
			outcome: { removed: 1 },
		},
		{
			name: "deleteStem",
			fn: songs.deleteStem,
			input: { id: STEM },
			arrange: () => data.deleteStem.mockResolvedValue({ songId: SONG }),
			dataFn: "deleteStem",
			args: [ACCOUNT, STEM],
			outcome: { deleted: true },
		},
		{
			name: "deleteDemo",
			fn: songs.deleteDemo,
			input: { id: DEMO },
			arrange: () => data.deleteDemo.mockResolvedValue(true),
			dataFn: "deleteDemo",
			args: [ACCOUNT, DEMO],
			outcome: { deleted: true },
		},
		{
			name: "removeDemoById",
			fn: songs.removeDemoById,
			input: { id: DEMO },
			arrange: () => data.deleteDemo.mockResolvedValue(true),
			dataFn: "deleteDemo",
			args: [ACCOUNT, DEMO],
			outcome: { deleted: true },
		},
		{
			name: "setSongVersion",
			fn: songs.setSongVersion,
			input: { id: SONG, version: "1.2.3" },
			arrange: () => data.setSongVersion.mockResolvedValue({ version: "1.2.3" }),
			dataFn: "setSongVersion",
			args: [ACCOUNT, SONG, "1.2.3"],
			outcome: "1.2.3",
		},
		{
			name: "saveSections",
			fn: songs.saveSections,
			input: { id: SONG, sections: [{ name: "Verse", start: 0 }] },
			arrange: () =>
				data.updateSongSections.mockResolvedValue({
					ok: true,
					sections: [{ index: "", name: "Verse", start: 0 }],
				}),
			dataFn: "updateSongSections",
			args: [ACCOUNT, SONG, [{ index: "", name: "Verse", start: 0 }]],
			outcome: [{ index: "", name: "Verse", start: 0 }],
		},
		{
			name: "saveChanges",
			fn: songs.saveChanges,
			input: { id: SONG, changes: [] },
			arrange: () => data.updateSongChanges.mockResolvedValue({ ok: true, changes: [] }),
			dataFn: "updateSongChanges",
			args: [ACCOUNT, SONG, []],
			outcome: [],
		},
		{
			name: "removeStemMidi",
			fn: songs.removeStemMidi,
			input: { id: STEM },
			arrange: () => data.removeStemMidi.mockResolvedValue(true),
			dataFn: "removeStemMidi",
			args: [ACCOUNT, STEM],
			outcome: { removed: true },
		},
		{
			name: "shareSong",
			fn: songs.shareSong,
			input: { songId: SONG, to: "friend@example.com" },
			anon: 401,
			arrange: () =>
				data.songForMix.mockResolvedValue({
					title: "Track",
					isPrivate: false,
					project: { isPrivate: false, name: "Album" },
				}),
			dataFn: "songSlugs",
			args: [ACCOUNT, SONG],
			outcome: { sent: "friend@example.com" },
		},
		{
			name: "renameStem",
			fn: songs.renameStem,
			input: { id: STEM, label: "Bass" },
			arrange: () => data.renameStem.mockResolvedValue({ id: STEM, label: "Bass" }),
			dataFn: "renameStem",
			args: [ACCOUNT, STEM, "Bass"],
			outcome: { id: STEM, label: "Bass" },
		},
		{
			name: "reorderStems",
			fn: songs.reorderStems,
			input: { songId: SONG, ids: [STEM] },
			arrange: () => data.reorderStems.mockResolvedValue([STEM]),
			dataFn: "reorderStems",
			args: [ACCOUNT, SONG, [STEM]],
			outcome: { ids: [STEM] },
		},
		{
			name: "askAiAboutSong",
			fn: songs.askAiAboutSong,
			input: { id: SONG },
			anon: 401,
			arrange: () => {
				data.songForMix.mockResolvedValue({
					accountId: ACCOUNT,
					noAi: false,
					project: { noAi: false },
					mixUrl: "https://blob/mix.mp3",
					changes: [],
				});
				aiDetect.askAiAboutMix.mockResolvedValue({ tempo: 120 });
			},
			dataFn: "songForMix",
			args: [SONG],
			outcome: { tempo: 120 },
		},
		{
			name: "draftChart",
			fn: songs.draftChart,
			input: {
				id: SONG,
				chords: [{ bar: 1, bars: 1, chord: "C" }],
				bars: [{ bar: 1, notes: "C4" }],
			},
			anon: 401,
			arrange: () => {
				data.getSongById.mockResolvedValue({
					title: "Track",
					noAi: false,
					project: { noAi: false },
					changes: [],
					startAt: 0,
					sections: [],
				});
				data.chartExamples.mockResolvedValue([]);
				aiDetect.draftChartWithAi.mockResolvedValue({
					chords: "C",
					sections: [],
					progressions: [],
					chart: "C",
					notes: "",
				});
			},
			dataFn: "getSongById",
			args: [ACCOUNT, SONG],
			outcome: {
				chords: "C",
				sections: [],
				progressions: [],
				chart: "C",
				notes: "",
				chartHtml: "<p>C</p>",
			},
		},
		{
			name: "saveChartDraft",
			fn: songs.saveChartDraft,
			input: { id: SONG, markdown: "C" },
			anon: 401,
			arrange: () => {
				data.getSongById.mockResolvedValue({ chartMarkdown: "" });
				data.saveSongDoc.mockResolvedValue({ ok: true, version: 1 });
			},
			dataFn: "saveSongDoc",
			args: [ACCOUNT, USER, SONG, "chart", "C"],
			outcome: { version: 1 },
		},
		{
			name: "songNotes",
			fn: songs.songNotes,
			input: { id: SONG },
			arrange: () => data.songNotesFor.mockResolvedValue({ notes: [], done: true }),
			dataFn: "songNotesFor",
			args: [ACCOUNT, SONG],
			outcome: { notes: [], done: true },
		},
		{
			name: "setSongStage",
			fn: songs.setSongStage,
			input: { id: SONG, stage: "mixing" },
			arrange: () => data.setSongStage.mockResolvedValue(true),
			dataFn: "setSongStage",
			args: [ACCOUNT, SONG, "mixing"],
			outcome: { stage: "mixing" },
		},
		{
			name: "saveDefaultMix",
			fn: songs.saveDefaultMix,
			input: { id: SONG, gains: [{ id: STEM, gain: 0.5 }] },
			arrange: () => data.setDefaultMix.mockResolvedValue(true),
			dataFn: "setDefaultMix",
			args: [ACCOUNT, SONG, [{ id: STEM, gain: 0.5 }]],
			outcome: { saved: 1 },
		},
		{
			name: "addSongCredit",
			fn: songs.addSongCredit,
			input: { songId: SONG, role: "composer", name: "Ann" },
			arrange: () => data.addSongCredit.mockResolvedValue({ id: fakeId("artist"), name: "Ann" }),
			dataFn: "addSongCredit",
			args: [ACCOUNT, SONG, "composer", "Ann"],
			outcome: { artistId: fakeId("artist"), name: "Ann" },
		},
		{
			name: "removeSongCredit",
			fn: songs.removeSongCredit,
			input: { id: CREDIT },
			arrange: () => data.removeSongCredit.mockResolvedValue(true),
			dataFn: "removeSongCredit",
			args: [ACCOUNT, CREDIT],
			outcome: { removed: true },
		},
	];
	for (const c of cases) {
		const run = () => {
			c.arrange?.();
			return call(c.fn, c.input);
		};
		const expectSuccess = async () => {
			if (typeof c.outcome === "object" && c.outcome && "status" in c.outcome)
				await expect(run()).rejects.toMatchObject(c.outcome);
			else await expect(run()).resolves.toEqual(c.outcome);
		};
		describe(c.name, () => {
			it(`${c.anon ?? 401} signed out`, async () => {
				asSignedOut();
				await expect(run()).rejects.toMatchObject(httpError(c.anon ?? 401));
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
			it("404 for a member not added to the restricted project", async () => {
				asEditorOf(ACCOUNT);
				data.projectRestricted.mockResolvedValue(true);
				await expect(run()).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("an admin passes the restriction", async () => {
				asAdminOf(ACCOUNT);
				data.projectRestricted.mockResolvedValue(true);
				await expectSuccess();
				expect(data.projectRestricted).not.toHaveBeenCalled();
			});
			it("a member reaches the data layer scoped by the account", async () => {
				asEditorOf(ACCOUNT);
				await expectSuccess();
				expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
			});
		});
	}
});

describe("saveDoc for the private note (whoever may view the song)", () => {
	const input = { songId: SONG, kind: "mynotes", markdown: "mine" };
	beforeEach(() => {
		data.songViewRow.mockResolvedValue({
			id: SONG,
			projectId: PROJECT,
			isPrivate: true,
			accountId: ACCOUNT,
			project: { isPrivate: false, isRestricted: false },
		});
		data.saveUserNote.mockResolvedValue({
			ok: true,
			version: 1,
			changed: true,
			html: "<p>mine</p>",
		});
	});
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(songs.saveDoc, input)).rejects.toMatchObject(httpError(401));
	});
	it("404 for a stranger to a private song", async () => {
		asOutsider();
		await expect(call(songs.saveDoc, input)).rejects.toMatchObject(httpError(404));
		expect(data.saveUserNote).not.toHaveBeenCalled();
	});
	it("a viewer keeps their own note, filed under the song's account", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(songs.saveDoc, input)).resolves.toEqual({
			version: 1,
			changed: true,
			html: "<p>mine</p>",
		});
		expect(data.saveUserNote).toHaveBeenCalledWith(SONG, USER, ACCOUNT, "mine", undefined, {
			confirmEmpty: false,
		});
		expect(data.saveSongDoc).not.toHaveBeenCalled();
	});
});

describe("side effects of the editor-gated functions", () => {
	it("deleteStem and saveDefaultMix re-render the mix in the jobs function", async () => {
		asEditorOf(ACCOUNT);
		data.deleteStem.mockResolvedValue({ songId: SONG });
		data.setDefaultMix.mockResolvedValue(true);
		await call(songs.deleteStem, { id: STEM });
		expect(jobs.scheduleMix).toHaveBeenCalledWith([SONG]);
		await call(songs.saveDefaultMix, { id: SONG, gains: [{ id: STEM, gain: 1 }] });
		expect(jobs.scheduleMix).toHaveBeenLastCalledWith([SONG]);
	});
	it("shareSong on a private song makes a viewing link for the recipient under the account", async () => {
		asEditorOf(ACCOUNT);
		data.songForMix.mockResolvedValue({
			title: "Track",
			isPrivate: true,
			project: { isPrivate: false, name: "Album" },
		});
		data.createShareLink.mockResolvedValue({ code: "sharecode" });
		await call(songs.shareSong, { songId: SONG, to: "friend@example.com" });
		expect(data.createShareLink).toHaveBeenCalledWith(
			ACCOUNT,
			USER,
			{ songId: SONG },
			expect.objectContaining({ maxUses: null }),
		);
		expect(email.sendShareEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: "friend@example.com", url: "http://localhost/s/sharecode" }),
		);
	});
	it("askAiAboutSong refuses a song whose project opted out of AI", async () => {
		asEditorOf(ACCOUNT);
		data.songForMix.mockResolvedValue({
			accountId: ACCOUNT,
			noAi: false,
			project: { noAi: true },
			mixUrl: "https://blob/mix.mp3",
			changes: [],
		});
		await expect(call(songs.askAiAboutSong, { id: SONG })).rejects.toMatchObject(httpError(403));
		expect(aiDetect.askAiAboutMix).not.toHaveBeenCalled();
	});
	it("saveChartDraft refuses to overwrite a chart unless told to", async () => {
		asEditorOf(ACCOUNT);
		data.getSongById.mockResolvedValue({ chartMarkdown: "old" });
		await expect(call(songs.saveChartDraft, { id: SONG, markdown: "C" })).rejects.toMatchObject(
			httpError(409),
		);
		expect(data.saveSongDoc).not.toHaveBeenCalled();
	});
});
