import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_ACCOUNT,
	OTHER_USER,
	USER,
	asEditorOf,
	asMemberOf,
	asSignedOut,
	asUser,
	call,
	fakeId,
	fakeMembership,
	fakeUser,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, jobs, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/**
 * Authorization of the takes' remote functions: a take is its idea's
 * maker's own; putting it on a song or a project needs, besides, an editor
 * of that song's or project's account, which may be another account.
 */
const recordings = await import("./recordings.remote");

const TAKE = fakeId("take-one");
const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");

/** The take exists in ACCOUNT; `userOwnsRecording` decides who made it. */
function givenTakeOwnedBy(userId: string) {
	givenRow("recording", { accountId: ACCOUNT });
	data.userOwnsRecording.mockImplementation(
		async (_account: string, user: string) => user === userId,
	);
}
/** The user owns the take in ACCOUNT and holds `role` in OTHER_ACCOUNT, where the song and project live. */
function asTakeOwnerWithRoleInOtherAccount(role: string | null) {
	givenTakeOwnedBy(USER);
	asUser(fakeUser(USER), [
		fakeMembership(ACCOUNT, "member"),
		...(role ? [fakeMembership(OTHER_ACCOUNT, role)] : []),
	]);
}

beforeEach(resetRemoteMocks);

describe("setTakeName and deleteTake (the take's own)", () => {
	const cases = [
		{
			name: "setTakeName",
			fn: recordings.setTakeName,
			input: { id: TAKE, title: "Verse" },
			dataFn: "renameRecording",
			args: [ACCOUNT, TAKE, "Verse"],
			result: true,
			answer: { title: "Verse" },
		},
		{
			name: "deleteTake",
			fn: recordings.deleteTake,
			input: { id: TAKE },
			dataFn: "deleteRecording",
			args: [ACCOUNT, TAKE],
			result: { ideaId: null },
			answer: { deleted: true, ideaDeleted: false },
		},
	];
	for (const c of cases) {
		describe(c.name, () => {
			it("401 signed out", async () => {
				asSignedOut();
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(401));
			});
			it("404 for an owner of the account who did not make it", async () => {
				givenTakeOwnedBy(OTHER_USER);
				asMemberOf(ACCOUNT, "owner");
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("the maker acts on it, scoped by the take's account", async () => {
				givenTakeOwnedBy(USER);
				asEditorOf(ACCOUNT);
				data[c.dataFn].mockResolvedValue(c.result);
				await expect(call(c.fn, c.input)).resolves.toEqual(c.answer);
				expect(data.userOwnsRecording).toHaveBeenCalledWith(ACCOUNT, USER, TAKE);
				expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
			});
		});
	}
});

describe("addRecordingToSong", () => {
	const input = { id: TAKE, songId: SONG, mergeNotes: false };
	beforeEach(() => {
		givenRow("song", { accountId: OTHER_ACCOUNT });
		data.songSlugs.mockResolvedValue({ account: "band", project: "album", song: "track" });
	});
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(recordings.addRecordingToSong, input)).rejects.toMatchObject(httpError(401));
	});
	it("404 when the take is someone else's", async () => {
		givenTakeOwnedBy(OTHER_USER);
		asMemberOf(ACCOUNT, "owner");
		await expect(call(recordings.addRecordingToSong, input)).rejects.toMatchObject(httpError(404));
		expect(data.copyRecordingToSong).not.toHaveBeenCalled();
	});
	it("404 when the user owns the take but is not in the song's account", async () => {
		asTakeOwnerWithRoleInOtherAccount(null);
		await expect(call(recordings.addRecordingToSong, input)).rejects.toMatchObject(httpError(404));
		expect(data.copyRecordingToSong).not.toHaveBeenCalled();
	});
	it("404 when the user owns the take but only views the song's account", async () => {
		asTakeOwnerWithRoleInOtherAccount("viewer");
		await expect(call(recordings.addRecordingToSong, input)).rejects.toMatchObject(httpError(404));
		expect(data.copyRecordingToSong).not.toHaveBeenCalled();
	});
	it("404 for a song that does not exist", async () => {
		asTakeOwnerWithRoleInOtherAccount("member");
		givenRow("song", null);
		await expect(call(recordings.addRecordingToSong, input)).rejects.toMatchObject(httpError(404));
	});
	it("an editor of the song's account copies their own take into it", async () => {
		asTakeOwnerWithRoleInOtherAccount("member");
		data.copyRecordingToSong.mockResolvedValue({ id: fakeId("demo") });
		await expect(call(recordings.addRecordingToSong, input)).resolves.toEqual({
			href: "/band/projects/album/track",
		});
		expect(data.copyRecordingToSong).toHaveBeenCalledWith(ACCOUNT, USER, TAKE, SONG);
		expect(data.songSlugs).toHaveBeenCalledWith(OTHER_ACCOUNT, SONG);
		expect(data.mergeIdeaNotesIntoSong).not.toHaveBeenCalled();
	});
	it("merges the notes under the same scoping when asked", async () => {
		asTakeOwnerWithRoleInOtherAccount("admin");
		data.copyRecordingToSong.mockResolvedValue({ id: fakeId("demo") });
		await call(recordings.addRecordingToSong, { id: TAKE, songId: SONG });
		expect(data.mergeIdeaNotesIntoSong).toHaveBeenCalledWith(ACCOUNT, USER, SONG, TAKE);
	});
});

describe("addRecordingStemsToSong", () => {
	const input = { id: TAKE, songId: SONG };
	beforeEach(() => {
		givenRow("song", { accountId: OTHER_ACCOUNT });
		data.songSlugs.mockResolvedValue({ account: "band", project: "album", song: "track" });
	});
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(recordings.addRecordingStemsToSong, input)).rejects.toMatchObject(
			httpError(401),
		);
	});
	it("404 when the user owns the take but is not an editor of the song's account", async () => {
		asTakeOwnerWithRoleInOtherAccount("viewer");
		await expect(call(recordings.addRecordingStemsToSong, input)).rejects.toMatchObject(
			httpError(404),
		);
		expect(data.copyRecordingStemsToSong).not.toHaveBeenCalled();
	});
	it("an editor of the song's account copies the sources and schedules their renditions", async () => {
		asTakeOwnerWithRoleInOtherAccount("member");
		const stems = [fakeId("stem-a"), fakeId("stem-b")];
		data.copyRecordingStemsToSong.mockResolvedValue(stems);
		await expect(call(recordings.addRecordingStemsToSong, input)).resolves.toEqual({
			href: "/band/projects/album/track",
			stems: 2,
		});
		expect(data.copyRecordingStemsToSong).toHaveBeenCalledWith(ACCOUNT, USER, TAKE, SONG);
		expect(jobs.schedulePlayback).toHaveBeenCalledWith(stems);
	});
});

describe("newSongFromRecording", () => {
	const input = { id: TAKE, projectId: PROJECT, title: "From a take", mergeNotes: false };
	beforeEach(() => {
		givenRow("project", { accountId: OTHER_ACCOUNT });
		data.projectSlugs.mockResolvedValue({ account: "band", project: "album" });
		data.createSong.mockResolvedValue({ id: SONG, slug: "from-a-take" });
		data.copyRecordingToSong.mockResolvedValue({ id: fakeId("demo") });
	});
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(recordings.newSongFromRecording, input)).rejects.toMatchObject(
			httpError(401),
		);
	});
	it("404 when the take is someone else's", async () => {
		givenTakeOwnedBy(OTHER_USER);
		asMemberOf(ACCOUNT, "owner");
		await expect(call(recordings.newSongFromRecording, input)).rejects.toMatchObject(
			httpError(404),
		);
		expect(data.createSong).not.toHaveBeenCalled();
	});
	it("404 when the user owns the take but is not an editor of the project's account", async () => {
		asTakeOwnerWithRoleInOtherAccount("viewer");
		await expect(call(recordings.newSongFromRecording, input)).rejects.toMatchObject(
			httpError(404),
		);
		expect(data.createSong).not.toHaveBeenCalled();
	});
	it("an editor of the project's account makes the song there, from their own take", async () => {
		asTakeOwnerWithRoleInOtherAccount("member");
		await expect(call(recordings.newSongFromRecording, input)).resolves.toEqual({
			href: "/band/projects/album/from-a-take",
		});
		expect(data.createSong).toHaveBeenCalledWith(OTHER_ACCOUNT, USER, PROJECT, "From a take");
		expect(data.copyRecordingToSong).toHaveBeenCalledWith(ACCOUNT, USER, TAKE, SONG);
	});
});
