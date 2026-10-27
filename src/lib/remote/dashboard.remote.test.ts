import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asMemberOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Authorization of dashboard pins (docs/dashboard-plan.md, step 5): a member of the target's account pins it to their own dashboard. */
const dashboard = await import("./dashboard.remote");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const SESSION = fakeId("session-one");

/** What the view rules see of the song and the project (viewAccess.ts): open to the account by default. */
const songRow = (restricted = false) => ({
	id: SONG,
	accountId: ACCOUNT,
	projectId: PROJECT,
	isPrivate: false,
	project: { isPrivate: false, isRestricted: restricted },
});
const projectRow = (restricted = false) => ({
	id: PROJECT,
	accountId: ACCOUNT,
	name: "Project",
	isPrivate: false,
	isRestricted: restricted,
});

beforeEach(() => {
	resetRemoteMocks();
	givenRow("song", { accountId: ACCOUNT });
	givenRow("project", { accountId: ACCOUNT });
	data.accountOfRecordingSession.mockResolvedValue(ACCOUNT);
	data.songViewRow.mockResolvedValue(songRow());
	data.projectViewRow.mockResolvedValue(projectRow());
});

describe("setPin", () => {
	const input = { kind: "song", id: SONG, pinned: true };
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(dashboard.setPin, input)).rejects.toMatchObject(httpError(401));
		expect(data.setDashboardPin).not.toHaveBeenCalled();
	});
	it("404 for a target that does not exist", async () => {
		asMemberOf(ACCOUNT);
		givenRow("song", null);
		await expect(call(dashboard.setPin, input)).rejects.toMatchObject(httpError(404));
		data.accountOfRecordingSession.mockResolvedValue(null);
		await expect(
			call(dashboard.setPin, { kind: "session", id: SESSION, pinned: true }),
		).rejects.toMatchObject(httpError(404));
		expect(data.setDashboardPin).not.toHaveBeenCalled();
	});
	it("404 for someone outside the target's account", async () => {
		asOutsider();
		await expect(call(dashboard.setPin, input)).rejects.toMatchObject(httpError(404));
		expect(data.setDashboardPin).not.toHaveBeenCalled();
	});
	it("a member pins and unpins a song, a project and a session", async () => {
		asMemberOf(ACCOUNT);
		await expect(call(dashboard.setPin, input)).resolves.toEqual({ pinned: true });
		expect(data.setDashboardPin).toHaveBeenLastCalledWith(USER, "song", SONG, ACCOUNT, true);
		await expect(
			call(dashboard.setPin, { kind: "project", id: PROJECT, pinned: false }),
		).resolves.toEqual({ pinned: false });
		expect(data.setDashboardPin).toHaveBeenLastCalledWith(USER, "project", PROJECT, ACCOUNT, false);
		await expect(
			call(dashboard.setPin, { kind: "session", id: SESSION, pinned: true }),
		).resolves.toEqual({ pinned: true });
		expect(data.accountOfRecordingSession).toHaveBeenCalledWith(SESSION);
		expect(data.setDashboardPin).toHaveBeenLastCalledWith(USER, "session", SESSION, ACCOUNT, true);
	});
	it("404 for a restricted project, or a song in one, the member is not on", async () => {
		asMemberOf(ACCOUNT);
		data.songViewRow.mockResolvedValue(songRow(true));
		data.projectViewRow.mockResolvedValue(projectRow(true));
		await expect(call(dashboard.setPin, input)).rejects.toMatchObject(httpError(404));
		await expect(
			call(dashboard.setPin, { kind: "project", id: PROJECT, pinned: true }),
		).rejects.toMatchObject(httpError(404));
		expect(data.setDashboardPin).not.toHaveBeenCalled();
	});
	it("a member on the restricted project pins it and its songs; an admin pins any", async () => {
		data.songViewRow.mockResolvedValue(songRow(true));
		data.projectViewRow.mockResolvedValue(projectRow(true));
		asMemberOf(ACCOUNT);
		data.projectRolesOf.mockResolvedValue({ [PROJECT]: "member" });
		await expect(call(dashboard.setPin, input)).resolves.toEqual({ pinned: true });
		await expect(
			call(dashboard.setPin, { kind: "project", id: PROJECT, pinned: true }),
		).resolves.toEqual({ pinned: true });
		expect(data.projectRolesOf).toHaveBeenCalledWith(ACCOUNT, USER);
		asMemberOf(ACCOUNT, "admin");
		data.projectRolesOf.mockResolvedValue({});
		await expect(call(dashboard.setPin, input)).resolves.toEqual({ pinned: true });
		expect(data.setDashboardPin).toHaveBeenCalledTimes(3);
	});
	it("404 for a song or project the view rules no longer find (archived project)", async () => {
		asMemberOf(ACCOUNT);
		data.projectViewRow.mockResolvedValue(null);
		await expect(
			call(dashboard.setPin, { kind: "project", id: PROJECT, pinned: true }),
		).rejects.toMatchObject(httpError(404));
		expect(data.setDashboardPin).not.toHaveBeenCalled();
	});
	it("a session needs only membership", async () => {
		asMemberOf(ACCOUNT);
		await expect(
			call(dashboard.setPin, { kind: "session", id: SESSION, pinned: true }),
		).resolves.toEqual({ pinned: true });
		expect(data.songViewRow).not.toHaveBeenCalled();
		expect(data.projectViewRow).not.toHaveBeenCalled();
	});
	it("a viewer of the account may pin too (pins are the person's own)", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(dashboard.setPin, input)).resolves.toEqual({ pinned: true });
		expect(data.setDashboardPin).toHaveBeenCalledWith(USER, "song", SONG, ACCOUNT, true);
	});
});
