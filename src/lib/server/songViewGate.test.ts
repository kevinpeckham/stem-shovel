import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_USER,
	USER,
	asEditorOf,
	asOutsider,
	asSignedOut,
	fakeId,
	httpError,
	type FakeRequestEvent,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";
import { requireSongView } from "./songViewGate";

/** The gate the song download routes share; each route's own test covers the rest of the access rules. */
const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const song = {
	id: SONG,
	projectId: PROJECT,
	isPrivate: false,
	project: { isPrivate: false, isRestricted: false },
};
const gate = (locals: FakeRequestEvent, query = "") =>
	requireSongView(song, ACCOUNT, {
		locals: locals.locals,
		url: new URL(`http://localhost/api/songs/${SONG}/mix${query}`),
		cookies: locals.cookies,
	});

beforeEach(() => resetRemoteMocks());

describe("requireSongView", () => {
	it("a public song passes signed out, with no role lookup and the query's share codes read", async () => {
		await expect(gate(asSignedOut(), "?share=CODE")).resolves.toBeUndefined();
		expect(data.projectRoleOf).not.toHaveBeenCalled();
		expect(data.openShareLinks).toHaveBeenCalledWith(["CODE"]);
	});
	it("a private song is a 403 to a stranger and passes a project viewer from outside", async () => {
		const closed = { ...song, isPrivate: true };
		await expect(
			requireSongView(closed, ACCOUNT, {
				locals: asOutsider().locals,
				url: new URL("http://localhost/x"),
				cookies: asOutsider().cookies,
			}),
		).rejects.toMatchObject(httpError(403));
		expect(data.projectRoleOf).toHaveBeenCalledWith(PROJECT, OTHER_USER);
		data.projectRoleOf.mockResolvedValue("viewer");
		await expect(
			requireSongView(closed, ACCOUNT, {
				locals: asOutsider().locals,
				url: new URL("http://localhost/x"),
				cookies: asOutsider().cookies,
			}),
		).resolves.toBeUndefined();
	});
	it("a restricted project closes the song to a member not added to it", async () => {
		const restricted = { ...song, project: { ...song.project, isRestricted: true } };
		const editor = asEditorOf(ACCOUNT);
		await expect(
			requireSongView(restricted, ACCOUNT, {
				locals: editor.locals,
				url: new URL("http://localhost/x"),
				cookies: editor.cookies,
			}),
		).rejects.toMatchObject(httpError(403));
		expect(data.projectRoleOf).toHaveBeenCalledWith(PROJECT, USER);
	});
});
