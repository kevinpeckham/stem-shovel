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

beforeEach(() => {
	resetRemoteMocks();
	givenRow("song", { accountId: ACCOUNT });
	givenRow("project", { accountId: ACCOUNT });
	data.accountOfRecordingSession.mockResolvedValue(ACCOUNT);
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
	it("a viewer of the account may pin too (pins are the person's own)", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(dashboard.setPin, input)).resolves.toEqual({ pinned: true });
		expect(data.setDashboardPin).toHaveBeenCalledWith(USER, "song", SONG, ACCOUNT, true);
	});
});
