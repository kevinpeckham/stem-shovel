import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_ACCOUNT,
	USER,
	asMemberOf,
	asOutsider,
	asSignedOut,
	asSuperAdmin,
	asViewerOf,
	call,
	fakeId,
	fakeMembership,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import {
	background,
	data,
	givenRow,
	jobs,
	lifecycle,
	resetRemoteMocks,
} from "../../../tests/helpers/fakeServerModules";

/** Authorization of dashboard pins (docs/dashboard-plan.md, step 5): a member of the target's account pins it to their own dashboard. */
const dashboard = await import("./dashboard.remote");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const SESSION = fakeId("session-one");
const SET_LIST = fakeId("setlist-one");

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
	givenRow("recordingSession", { accountId: ACCOUNT });
	givenRow("setList", { accountId: ACCOUNT });
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
		givenRow("recordingSession", null);
		await expect(
			call(dashboard.setPin, { kind: "session", id: SESSION, pinned: true }),
		).rejects.toMatchObject(httpError(404));
		givenRow("setList", null);
		await expect(
			call(dashboard.setPin, { kind: "setList", id: SET_LIST, pinned: true }),
		).rejects.toMatchObject(httpError(404));
		expect(data.setDashboardPin).not.toHaveBeenCalled();
	});
	it("404 for someone outside the target's account", async () => {
		asOutsider();
		await expect(call(dashboard.setPin, input)).rejects.toMatchObject(httpError(404));
		expect(data.setDashboardPin).not.toHaveBeenCalled();
	});
	it("a member pins and unpins a song, a project, a session and a set list", async () => {
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
		expect(data.setDashboardPin).toHaveBeenLastCalledWith(USER, "session", SESSION, ACCOUNT, true);
		await expect(
			call(dashboard.setPin, { kind: "setList", id: SET_LIST, pinned: false }),
		).resolves.toEqual({ pinned: false });
		expect(data.setDashboardPin).toHaveBeenLastCalledWith(
			USER,
			"setList",
			SET_LIST,
			ACCOUNT,
			false,
		);
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
	it("a session or a set list needs only membership", async () => {
		asMemberOf(ACCOUNT);
		await expect(
			call(dashboard.setPin, { kind: "session", id: SESSION, pinned: true }),
		).resolves.toEqual({ pinned: true });
		await expect(
			call(dashboard.setPin, { kind: "setList", id: SET_LIST, pinned: true }),
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

describe("removeActivityItem", () => {
	const SUPER = fakeId("superadmin");
	const ROW = fakeId("row-one");
	/** The super admin: a real member of OTHER_ACCOUNT, acting as the owner of ACCOUNT. */
	const asKevin = () =>
		asSuperAdmin([
			fakeMembership(OTHER_ACCOUNT, "owner"),
			fakeMembership(ACCOUNT, "owner", { actingAs: true }),
		]);
	const remove = (id: string) => call(dashboard.removeActivityItem, { id });
	const given = (accountId: string, actorId: string | null) =>
		data.activityItemOf.mockResolvedValue({ accountId, actorId });
	const deletes = [
		"deleteStem",
		"deleteDemo",
		"deleteMix",
		"deleteSessionRecording",
		"deleteSongDocVersion",
		"deleteChatMessage",
		"deleteSessionChatMessage",
		"deleteComment",
		"deleteSessionComment",
		"deleteSong",
	];
	const nothingDeleted = () => {
		for (const fn of deletes) expect(data[fn]).not.toHaveBeenCalled();
		expect(lifecycle.deleteProject).not.toHaveBeenCalled();
	};

	it("404 signed out and for anyone but a super admin, even the band's owner", async () => {
		given(ACCOUNT, USER);
		asSignedOut();
		await expect(remove(`stem:${ROW}`)).rejects.toMatchObject(httpError(404));
		asMemberOf(ACCOUNT, "owner");
		await expect(remove(`stem:${ROW}`)).rejects.toMatchObject(httpError(404));
		expect(data.activityItemOf).not.toHaveBeenCalled();
		nothingDeleted();
	});

	it("refuses a malformed id", async () => {
		asKevin();
		await expect(remove("idea:abc")).rejects.toThrow();
		await expect(remove("stem:")).rejects.toThrow();
		nothingDeleted();
	});

	it("404 for a row that is gone, someone else's, or one without an author", async () => {
		asKevin();
		data.activityItemOf.mockResolvedValue(null);
		await expect(remove(`stem:${ROW}`)).rejects.toMatchObject(httpError(404));
		given(ACCOUNT, "pat");
		await expect(remove(`stem:${ROW}`)).rejects.toMatchObject(httpError(404));
		given(ACCOUNT, null);
		await expect(remove(`session-recording:${ROW}`)).rejects.toMatchObject(httpError(404));
		nothingDeleted();
	});

	it("404 in an account the super admin really belongs to (their work there is a member's)", async () => {
		asKevin();
		given(OTHER_ACCOUNT, SUPER);
		await expect(remove(`stem:${ROW}`)).rejects.toMatchObject(httpError(404));
		nothingDeleted();
	});

	it.each([
		["stem", "deleteStem", [ACCOUNT, ROW]],
		["demo", "deleteDemo", [ACCOUNT, ROW]],
		["mix", "deleteMix", [ACCOUNT, ROW]],
		["session-recording", "deleteSessionRecording", [ACCOUNT, ROW]],
		["doc", "deleteSongDocVersion", [ACCOUNT, ROW]],
		["chat", "deleteChatMessage", [ROW]],
		["session-chat", "deleteSessionChatMessage", [ROW]],
		["comment", "deleteComment", [ROW]],
		["session-comment", "deleteSessionComment", [ROW]],
		["song", "deleteSong", [ACCOUNT, ROW]],
	])("a %s they made while acting goes through %s, audited", async (kind, fn, args) => {
		asKevin();
		given(ACCOUNT, SUPER);
		await expect(remove(`${kind}:${ROW}`)).resolves.toEqual({ removed: true });
		expect(data.activityItemOf).toHaveBeenCalledWith(kind, ROW);
		expect(data[fn]).toHaveBeenCalledWith(...args);
		for (const other of deletes.filter((d) => d !== fn)) expect(data[other]).not.toHaveBeenCalled();
		// requireMember's audit line for the acting membership
		expect(background).toHaveBeenCalledTimes(1);
		await background.mock.calls[0][0]();
		expect(data.logAudit).toHaveBeenCalledWith(
			expect.objectContaining({ userId: SUPER, accountId: ACCOUNT }),
		);
	});

	it("a stem's removal re-renders its song's mix", async () => {
		asKevin();
		given(ACCOUNT, SUPER);
		data.deleteStem.mockResolvedValue({ songId: "song-x" });
		await remove(`stem:${ROW}`);
		expect(jobs.scheduleMix).toHaveBeenCalledWith(["song-x"]);
	});

	it("a project goes through projectLifecycle's delete; an active one is refused with a 400", async () => {
		asKevin();
		given(ACCOUNT, SUPER);
		lifecycle.deleteProject.mockResolvedValue("deleted");
		await expect(remove(`project:${ROW}`)).resolves.toEqual({ removed: true });
		expect(lifecycle.deleteProject).toHaveBeenCalledWith(ACCOUNT, ROW);
		lifecycle.deleteProject.mockResolvedValue("active");
		await expect(remove(`project:${ROW}`)).rejects.toMatchObject(httpError(400));
	});
});
