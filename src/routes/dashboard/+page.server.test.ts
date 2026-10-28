import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_ACCOUNT,
	USER,
	fakeId,
	fakeMembership,
	fakeUser,
	type FakeMembership,
} from "../../../tests/helpers/fakeRequestEvent";
import {
	background,
	calendar,
	data,
	notifications,
	resetRemoteMocks,
} from "../../../tests/helpers/fakeServerModules";
import { DASHBOARD_NUDGE_CAP } from "#lib/constants/dashboardLinks.js";

/** The dashboard's loader (docs/dashboard-plan.md): what a signed-in person sees across their accounts, filtered by what they may open. */
const { load } = await import("./+page.server");

type Row = Record<string, unknown>;
type Result = Record<string, any>; // oxlint-disable-line no-explicit-any -- the loader's return, read loosely

const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12));
const PROJECT = fakeId("proj-one");
const SECRET = fakeId("proj-secret");

// ---- row builders --------------------------------------------------------

const member = (accountId = ACCOUNT, role = "member", overrides: Partial<FakeMembership> = {}) =>
	fakeMembership(accountId, role, { name: accountId === ACCOUNT ? "One" : "Two", ...overrides });

/** What `canViewSong` reads; restricted means the project is restricted. */
const songFacts = (projectId = PROJECT, restricted = false) => ({
	id: fakeId(`song-of-${projectId}`),
	isPrivate: false,
	projectId,
	project: { isPrivate: false, isRestricted: restricted },
});

const projectRow = (id: string, updatedAt: Date, overrides: Row = {}): Row => ({
	id,
	slug: id.replace(/_+$/, ""),
	name: `Project ${id.replace(/_+$/, "")}`,
	isPrivate: false,
	isRestricted: false,
	songCount: 2,
	updatedAt,
	...overrides,
});

const songRow = (id: string, updatedAt: Date, overrides: Row = {}): Row => ({
	id,
	slug: id.replace(/_+$/, ""),
	title: `Song ${id.replace(/_+$/, "")}`,
	projectId: PROJECT,
	isPrivate: false,
	stage: null,
	isFinished: false,
	hasMix: false,
	hasStem: true,
	stemCount: 3,
	demoCount: 1,
	updatedAt,
	project: {
		slug: "proj-one",
		name: "Big Project",
		status: "active",
		isPrivate: false,
		isRestricted: false,
	},
	...overrides,
});

const sessionRow = (id: string, startsOn: string, overrides: Row = {}): Row => ({
	id,
	name: "",
	place: "The Elbow Room",
	kind: "show",
	startsOn,
	recordingCount: 4,
	...overrides,
});

const songChatRow = (title: string, latest: Date, song = songFacts()): Row => ({
	songId: song.id,
	title,
	href: `/x/${title}`,
	unread: 1,
	latest,
	...song,
	project: { ...song.project, name: "Big Project" },
});

const event = (id: string, at: Date, song: Row | null = null): Row => ({
	id,
	kind: "stem",
	at,
	who: "Pat",
	label: "Bass",
	title: `Event ${id}`,
	href: `/e/${id}`,
	song,
});

const pendingRow = (id: string, since: Date, song: Row | null = null): Row => ({
	id,
	kind: "demo",
	state: "rendering",
	label: "Rough",
	title: `Pending ${id}`,
	href: `/p/${id}`,
	since,
	song,
});

const nudge = (id: string, at: Date, song: Row | null = null): Row => ({
	id,
	kind: "stale",
	title: `Nudge ${id}`,
	href: `/n/${id}`,
	at,
	song,
});

const inboxItem = (id: string, kind: string, updatedAt: Date, readAt: Date | null = null): Row => ({
	id,
	kind,
	count: 1,
	readAt,
	updatedAt,
});

// ---- calling the loader --------------------------------------------------

async function run(memberships: FakeMembership[], user = fakeUser(), search = ""): Promise<Result> {
	return (await load({
		locals: { user, memberships },
		url: new URL(`http://localhost/dashboard${search}`),
	} as never)) as Result;
}

const ids = (entries: { id: string }[]) => entries.map((e) => e.id);

const PER_ACCOUNT = [
	"projectRolesOf",
	"accountCounts",
	"recentRecordingSessions",
	"recentSetLists",
	"recentProjects",
	"recentSongs",
	"unreadSongChats",
	"unreadSessionChats",
	"accountQuota",
	"accountActivity",
	"accountPendingWork",
	"accountBand",
	"accountNudges",
	"pendingInvitations",
	"listInviteCodes",
] as const;

beforeEach(() => {
	resetRemoteMocks();
	notifications.listInbox.mockResolvedValue([]);
	data.recentUserIdeas.mockResolvedValue([]);
	data.userIdeaNudges.mockResolvedValue([]);
	data.listDashboardPins.mockResolvedValue([]);
	data.touchDashboardSeen.mockResolvedValue(null);
	data.accountCounts.mockResolvedValue({ projects: 0, songs: 0 });
	data.recentRecordingSessions.mockResolvedValue([]);
	data.recentSetLists.mockResolvedValue([]);
	data.recentProjects.mockResolvedValue([]);
	data.recentSongs.mockResolvedValue([]);
	data.unreadSongChats.mockResolvedValue([]);
	data.unreadSessionChats.mockResolvedValue([]);
	data.accountQuota.mockResolvedValue(null);
	data.accountActivity.mockResolvedValue([]);
	data.accountPendingWork.mockResolvedValue([]);
	data.accountBand.mockResolvedValue([]);
	data.accountNudges.mockResolvedValue([]);
	data.pendingInvitations.mockResolvedValue([]);
	data.listInviteCodes.mockResolvedValue([]);
	calendar.upcomingEvents.mockResolvedValue([]);
});

// ---- tests ---------------------------------------------------------------

describe("dashboard load: who", () => {
	it("redirects to sign-in when signed out", async () => {
		const result = load({
			locals: { user: null, memberships: [] },
			url: new URL("http://localhost/dashboard"),
		} as never);
		await expect(result).rejects.toMatchObject({
			status: 303,
			location: expect.stringMatching(/^\/sign-in/),
		});
	});

	it("with no memberships, empty lists and only the user's own lookups", async () => {
		const r = await run([]);
		expect(r.accounts).toEqual([]);
		for (const key of [
			"chats",
			"activity",
			"pending",
			"nudges",
			"pinned",
			"comments",
			"projects",
			"songs",
			"sessions",
			"setLists",
			"ideas",
			"loops",
			"multitracks",
		])
			expect(r[key]).toEqual([]);
		for (const fn of PER_ACCOUNT) expect(data[fn]).not.toHaveBeenCalled();
		expect(notifications.listInbox).toHaveBeenCalledWith(USER);
		const kinds = data.recentUserIdeas.mock.calls.map((c) => [c[0], c[1]]);
		expect(kinds).toEqual([
			[USER, "idea"],
			[USER, "loop"],
			[USER, "song"],
		]);
		expect(data.userIdeaNudges).toHaveBeenCalledWith(USER);
		expect(data.listDashboardPins).toHaveBeenCalledWith(USER);
		expect(data.touchDashboardSeen).toHaveBeenCalledWith(USER);
	});

	it("skips a super admin's acting memberships", async () => {
		const r = await run([member(ACCOUNT), member(OTHER_ACCOUNT, "owner", { actingAs: true })]);
		expect(r.accounts.map((a: Row) => a.slug)).toEqual([member(ACCOUNT).slug]);
		expect(data.projectRolesOf).toHaveBeenCalledTimes(1);
		expect(data.projectRolesOf).toHaveBeenCalledWith(ACCOUNT, USER);
	});

	it("counts go by the project roles looked up first", async () => {
		const roles = { [SECRET]: "member" };
		data.projectRolesOf.mockResolvedValue(roles);
		await run([member(ACCOUNT, "member")]);
		expect(data.accountCounts).toHaveBeenCalledWith(ACCOUNT, {
			accountRole: "member",
			projectRoles: roles,
		});
		expect(data.projectRolesOf.mock.invocationCallOrder[0]).toBeLessThan(
			data.accountCounts.mock.invocationCallOrder[0],
		);
	});
});

describe("dashboard load: one account (?account=)", () => {
	const acting = member(OTHER_ACCOUNT, "owner", { actingAs: true });

	it("without the parameter, viewing is null", async () => {
		expect((await run([member(ACCOUNT)])).viewing).toBeNull();
	});

	it("an acting slug narrows to that account, logs the use and leaves the seen marker alone", async () => {
		data.touchDashboardSeen.mockResolvedValue(day(20));
		const r = await run([member(ACCOUNT), acting], fakeUser(), `?account=${acting.slug}`);
		expect(r.accounts.map((a: Row) => a.slug)).toEqual([acting.slug]);
		expect(r.viewing).toEqual({
			kind: "account",
			slug: acting.slug,
			name: "Two",
			actingAs: true,
		});
		expect(data.projectRolesOf).toHaveBeenCalledTimes(1);
		expect(data.projectRolesOf).toHaveBeenCalledWith(OTHER_ACCOUNT, USER);
		expect(data.touchDashboardSeen).not.toHaveBeenCalled();
		expect(r.seenAt).toBeNull();
		// requireMember's audit line, written in the background
		expect(background).toHaveBeenCalledTimes(1);
		await background.mock.calls[0][0]();
		expect(data.logAudit).toHaveBeenCalledWith(
			expect.objectContaining({ userId: USER, accountId: OTHER_ACCOUNT }),
		);
	});

	it("a real slug narrows to that account and still records the visit", async () => {
		const own = member(ACCOUNT, "admin");
		const r = await run([own, member(OTHER_ACCOUNT)], fakeUser(), `?account=${own.slug}`);
		expect(r.accounts.map((a: Row) => a.slug)).toEqual([own.slug]);
		expect(r.viewing).toEqual({
			kind: "account",
			slug: own.slug,
			name: "One",
			actingAs: false,
		});
		expect(data.touchDashboardSeen).toHaveBeenCalledWith(USER);
		expect(background).not.toHaveBeenCalled();
	});

	it("an unknown slug is a 404", async () => {
		await expect(run([member(ACCOUNT)], fakeUser(), "?account=nobody")).rejects.toMatchObject({
			status: 404,
		});
		expect(data.touchDashboardSeen).not.toHaveBeenCalled();
	});
});

describe("dashboard load: another user's dashboard (?user=)", () => {
	const TARGET = fakeId("user-target");
	const ADMIN = fakeId("user-admin");
	const superAdmin = () => fakeUser(ADMIN, { isSuperAdmin: true });
	const targetRow = { id: TARGET, name: "Tess", email: "tess@example.com" };
	const theirs = member(ACCOUNT, "member");

	beforeEach(() => {
		data.userById.mockResolvedValue(targetRow);
		data.membershipsOfUser.mockResolvedValue([theirs]);
		data.dashboardSeenAtOf.mockResolvedValue(day(15));
	});

	it("is a 404 for anyone but a super admin, and nothing is looked up or logged", async () => {
		const own = member(OTHER_ACCOUNT, "owner");
		await expect(run([own], fakeUser(), `?user=${TARGET}`)).rejects.toMatchObject({
			status: 404,
		});
		expect(data.userById).not.toHaveBeenCalled();
		expect(data.membershipsOfUser).not.toHaveBeenCalled();
		expect(background).not.toHaveBeenCalled();
		expect(data.touchDashboardSeen).not.toHaveBeenCalled();
	});

	it("is a 404 for an unknown id", async () => {
		data.userById.mockResolvedValue(null);
		await expect(run([], superAdmin(), "?user=nobody")).rejects.toMatchObject({ status: 404 });
		expect(data.userById).toHaveBeenCalledWith("nobody");
		expect(background).not.toHaveBeenCalled();
	});

	it("builds everything for the target, reads their marker without moving it, and logs the view", async () => {
		const adminOwn = member(OTHER_ACCOUNT, "owner");
		const r = await run(
			[adminOwn, member(ACCOUNT, "owner", { actingAs: true })],
			superAdmin(),
			`?user=${TARGET}&account=${adminOwn.slug}`,
		);
		expect(data.membershipsOfUser).toHaveBeenCalledWith(TARGET);
		expect(r.accounts.map((a: Row) => a.slug)).toEqual([theirs.slug]);
		expect(data.projectRolesOf).toHaveBeenCalledTimes(1);
		expect(data.projectRolesOf).toHaveBeenCalledWith(ACCOUNT, TARGET);
		expect(data.unreadSongChats).toHaveBeenCalledWith(ACCOUNT, theirs.slug, TARGET);
		expect(data.unreadSessionChats).toHaveBeenCalledWith(ACCOUNT, theirs.slug, TARGET);
		expect(notifications.listInbox).toHaveBeenCalledWith(TARGET);
		expect(data.recentUserIdeas.mock.calls.map((c) => [c[0], c[1]])).toEqual([
			[TARGET, "idea"],
			[TARGET, "loop"],
			[TARGET, "song"],
		]);
		expect(data.userIdeaNudges).toHaveBeenCalledWith(TARGET);
		expect(data.listDashboardPins).toHaveBeenCalledWith(TARGET);
		expect(data.touchDashboardSeen).not.toHaveBeenCalled();
		expect(data.dashboardSeenAtOf).toHaveBeenCalledWith(TARGET);
		expect(r.seenAt).toEqual(day(15));
		expect(r.viewing).toEqual({ kind: "user", id: TARGET, name: "Tess" });
		// One audit line, written in the background, under the admin's id and no account.
		expect(background).toHaveBeenCalledTimes(1);
		await background.mock.calls[0][0]();
		expect(data.logAudit).toHaveBeenCalledTimes(1);
		expect(data.logAudit).toHaveBeenCalledWith({
			userId: ADMIN,
			accountId: null,
			action: expect.stringContaining(`view-as-user ${TARGET} GET /dashboard?user=${TARGET}`),
		});
	});
});

describe("dashboard load: what a person may open", () => {
	const restrictedSong = songFacts(SECRET, true);
	function givenRestrictedRows() {
		data.recentProjects.mockResolvedValue([
			projectRow(PROJECT, day(2)),
			projectRow(SECRET, day(3), { isRestricted: true }),
		]);
		data.recentSongs.mockResolvedValue([
			songRow(fakeId("song-open"), day(2)),
			songRow(fakeId("song-secret"), day(3), {
				projectId: SECRET,
				project: { ...restrictedSong.project, slug: "s", name: "S", status: "active" },
			}),
			songRow(fakeId("song-archived"), day(4), {
				project: {
					slug: "a",
					name: "A",
					status: "archived",
					isPrivate: false,
					isRestricted: false,
				},
			}),
		]);
		data.unreadSongChats.mockResolvedValue([
			songChatRow("open", day(2)),
			songChatRow("secret", day(3), restrictedSong),
		]);
		data.accountActivity.mockResolvedValue([
			event("ev-open", day(2), songFacts()),
			event("ev-secret", day(3), restrictedSong),
			event("ev-session", day(4), null),
		]);
		data.accountPendingWork.mockResolvedValue([
			pendingRow("pw-secret", day(2), restrictedSong),
			pendingRow("pw-session", day(3)),
		]);
		data.accountNudges.mockResolvedValue([
			nudge("nu-secret", day(2), restrictedSong),
			{ ...nudge("nu-none", day(3)), song: undefined },
		]);
	}

	it("a plain member does not see a restricted project's work or an inactive project's songs", async () => {
		givenRestrictedRows();
		const r = await run([member(ACCOUNT, "member")]);
		expect(ids(r.projects)).toEqual([PROJECT]);
		expect(ids(r.songs)).toEqual([fakeId("song-open")]);
		expect(r.chats.map((c: Row) => c.title)).toEqual(["open"]);
		expect(ids(r.activity).sort()).toEqual(
			[`${member().slug}:ev-open`, `${member().slug}:ev-session`].sort(),
		);
		expect(ids(r.pending)).toEqual([`${member().slug}:pw-session`]);
		expect(ids(r.nudges)).toEqual([`${member().slug}:nu-none`]);
	});

	it("a role on the restricted project opens it", async () => {
		givenRestrictedRows();
		data.projectRolesOf.mockResolvedValue({ [SECRET]: "member" });
		const r = await run([member(ACCOUNT, "member")]);
		expect(ids(r.projects)).toEqual([SECRET, PROJECT]);
		expect(ids(r.songs)).toEqual([fakeId("song-secret"), fakeId("song-open")]);
		expect(r.chats).toHaveLength(2);
		expect(r.activity).toHaveLength(3);
		expect(r.pending).toHaveLength(2);
		expect(r.nudges).toHaveLength(2);
	});

	it.each(["admin", "owner"])(
		"an %s sees everything in the account (but not inactive songs)",
		async (role) => {
			givenRestrictedRows();
			const r = await run([member(ACCOUNT, role)]);
			expect(ids(r.projects)).toEqual([SECRET, PROJECT]);
			expect(ids(r.songs)).toEqual([fakeId("song-secret"), fakeId("song-open")]);
			expect(r.chats).toHaveLength(2);
			expect(r.activity).toHaveLength(3);
			expect(r.pending).toHaveLength(2);
			expect(r.nudges).toHaveLength(2);
		},
	);
});

describe("dashboard load: tiles", () => {
	it("a member's tile has no quota or invites, and neither is looked up", async () => {
		const r = await run([member(ACCOUNT, "member")]);
		expect(r.accounts[0]).toMatchObject({ role: "member", quota: null, invites: null });
		expect(data.accountQuota).not.toHaveBeenCalled();
		expect(data.pendingInvitations).not.toHaveBeenCalled();
		expect(data.listInviteCodes).not.toHaveBeenCalled();
	});

	it("an admin's tile counts unexpired invitations and open codes", async () => {
		const quota = { bytes: 1, seats: 2 };
		data.accountQuota.mockResolvedValue(quota);
		const future = new Date(Date.now() + 86_400_000);
		const past = new Date(Date.now() - 86_400_000);
		data.pendingInvitations.mockResolvedValue([
			{ expiresAt: future },
			{ expiresAt: future },
			{ expiresAt: past },
		]);
		data.listInviteCodes.mockResolvedValue([
			{ state: "open" },
			{ state: "revoked" },
			{ state: "expired" },
		]);
		const r = await run([member(ACCOUNT, "admin")]);
		expect(data.accountQuota).toHaveBeenCalledWith(ACCOUNT);
		expect(data.pendingInvitations).toHaveBeenCalledWith(ACCOUNT);
		expect(data.listInviteCodes).toHaveBeenCalledWith(ACCOUNT);
		expect(r.accounts[0]).toMatchObject({
			role: "admin",
			quota,
			invites: { invitations: 2, codes: 1 },
		});
	});
});

describe("dashboard load: projects, songs and sessions", () => {
	function givenTwoAccounts() {
		data.recentProjects.mockImplementation(async (accountId: string) =>
			accountId === ACCOUNT
				? [projectRow(fakeId("p-a1"), day(1)), projectRow(fakeId("p-a3"), day(3))]
				: [projectRow(fakeId("p-b2"), day(2))],
		);
		data.recentSongs.mockImplementation(async (accountId: string) =>
			accountId === ACCOUNT ? [songRow(fakeId("s-a1"), day(1))] : [songRow(fakeId("s-b2"), day(2))],
		);
		data.recentRecordingSessions.mockImplementation(async (accountId: string) =>
			accountId === ACCOUNT
				? [sessionRow(fakeId("x-a5"), "2026-10-05")]
				: [sessionRow(fakeId("x-b9"), "2026-10-09"), sessionRow(fakeId("x-b1"), "2026-10-01")],
		);
	}

	it("newest first across accounts, with the account name in the meta", async () => {
		givenTwoAccounts();
		const one = member(ACCOUNT);
		const two = member(OTHER_ACCOUNT);
		const r = await run([one, two]);
		expect(ids(r.projects)).toEqual([fakeId("p-a3"), fakeId("p-b2"), fakeId("p-a1")]);
		expect(ids(r.songs)).toEqual([fakeId("s-b2"), fakeId("s-a1")]);
		expect(ids(r.sessions)).toEqual([fakeId("x-b9"), fakeId("x-a5"), fakeId("x-b1")]);
		expect(r.projects[1]).toMatchObject({
			account: two.slug,
			pin: { kind: "project", id: fakeId("p-b2") },
			href: `/${two.slug}/projects/p-b2`,
			meta: "2 songs · Two",
		});
		expect(r.songs[1]).toMatchObject({
			account: one.slug,
			pin: { kind: "song", id: fakeId("s-a1") },
			meta: "Big Project · Arranging · 3 stems · 1 demo · One",
		});
		expect(r.sessions[0]).toMatchObject({
			account: two.slug,
			pin: { kind: "session", id: fakeId("x-b9") },
			href: `/${two.slug}/sessions/s/${fakeId("x-b9")}`,
			when: new Date("2026-10-09"),
			title: expect.stringContaining("The Elbow Room"),
		});
		expect(r.sessions[0].meta).toMatch(/^Show · The Elbow Room · 4 recordings · Two$/);
	});

	it("with one account, the meta leaves the account name out", async () => {
		givenTwoAccounts();
		const r = await run([member(ACCOUNT)]);
		expect(r.projects[0].meta).toBe("2 songs");
		expect(r.songs[0].meta).toBe("Big Project · Arranging · 3 stems · 1 demo");
		expect(r.sessions[0].meta).toBe("Show · The Elbow Room · 4 recordings");
	});
});

describe("dashboard load: set lists", () => {
	const setListRow = (id: string, updatedAt: Date, overrides: Row = {}): Row => ({
		id,
		title: `Set ${id.replace(/_+$/, "")}`,
		createdAt: day(1),
		updatedAt,
		itemCount: 12,
		creator: { name: "Kevin" },
		...overrides,
	});

	it("newest first across accounts, pinnable, under rows, author and account", async () => {
		data.recentSetLists.mockImplementation(async (accountId: string) =>
			accountId === ACCOUNT
				? [setListRow(fakeId("l-a2"), day(2)), setListRow(fakeId("l-a7"), day(7))]
				: [setListRow(fakeId("l-b4"), day(4), { itemCount: 1, creator: null })],
		);
		const one = member(ACCOUNT);
		const two = member(OTHER_ACCOUNT);
		const r = await run([one, two]);
		expect(data.recentSetLists).toHaveBeenCalledWith(ACCOUNT, expect.any(Number));
		expect(ids(r.setLists)).toEqual([fakeId("l-a7"), fakeId("l-b4"), fakeId("l-a2")]);
		expect(r.setLists[0]).toMatchObject({
			account: one.slug,
			title: "Set l-a7",
			href: `/${one.slug}/set-lists/${fakeId("l-a7")}`,
			when: day(7),
			pin: { kind: "setList", id: fakeId("l-a7") },
			meta: "12 rows · by Kevin · One",
		});
		expect(r.setLists[1].meta).toBe("1 row · Two");
	});

	it("with one account, the meta leaves the account name out", async () => {
		data.recentSetLists.mockResolvedValue([setListRow(fakeId("l-a2"), day(2))]);
		const r = await run([member(ACCOUNT)]);
		expect(r.setLists[0].meta).toBe("12 rows · by Kevin");
	});
});

describe("dashboard load: pins", () => {
	const pin = (kind: string, targetId: string, accountId: string, facts: Row = {}): Row => ({
		kind,
		targetId,
		accountId,
		title: `Pin ${targetId}`,
		href: `/pin/${targetId}`,
		at: day(5),
		pinnedAt: day(6),
		song: null,
		project: null,
		...facts,
	});

	it("keeps pins in the person's accounts they may still open", async () => {
		data.listDashboardPins.mockResolvedValue([
			pin("song", fakeId("pin-song"), ACCOUNT, { song: songFacts() }),
			pin("song", fakeId("pin-secret-song"), ACCOUNT, { song: songFacts(SECRET, true) }),
			pin("project", PROJECT, ACCOUNT, {
				project: { id: PROJECT, isPrivate: false, isRestricted: false },
			}),
			pin("project", SECRET, ACCOUNT, {
				project: { id: SECRET, isPrivate: false, isRestricted: true },
			}),
			pin("session", fakeId("pin-session"), ACCOUNT),
			pin("session", fakeId("pin-elsewhere"), OTHER_ACCOUNT),
			pin("setList", fakeId("pin-set"), ACCOUNT),
			pin("setList", fakeId("pin-set-elsewhere"), OTHER_ACCOUNT),
		]);
		const r = await run([member(ACCOUNT, "member")]);
		expect(ids(r.pinned)).toEqual([
			`pin:song:${fakeId("pin-song")}`,
			`pin:project:${PROJECT}`,
			`pin:session:${fakeId("pin-session")}`,
			`pin:setList:${fakeId("pin-set")}`,
		]);
		expect(r.pinned.map((p: Row) => p.meta)).toEqual(["Song", "Project", "Session", "Set list"]);
		expect(r.pinned[3]).toMatchObject({
			pin: { kind: "setList", id: fakeId("pin-set") },
			href: `/pin/${fakeId("pin-set")}`,
		});
		expect(r.pinned[0]).toMatchObject({
			account: member().slug,
			pin: { kind: "song", id: fakeId("pin-song") },
			href: `/pin/${fakeId("pin-song")}`,
		});
	});
});

describe("dashboard load: nudges, pending and activity", () => {
	it("nudges merge account and idea nudges oldest first, capped", async () => {
		data.accountNudges.mockResolvedValue(
			Array.from({ length: DASHBOARD_NUDGE_CAP }, (_, i) => nudge(`acct-${i}`, day(10 + i))),
		);
		data.userIdeaNudges.mockResolvedValue([
			{ ...nudge("idea-old", day(1)), kind: "idea-no-take" },
			{ ...nudge("idea-new", day(28)), kind: "idea-no-take" },
		]);
		const r = await run([member(ACCOUNT)]);
		expect(r.nudges).toHaveLength(DASHBOARD_NUDGE_CAP);
		expect(r.nudges[0]).toMatchObject({ id: "idea-old", meta: "No take yet" });
		expect(ids(r.nudges)).not.toContain("idea-new");
		const times = r.nudges.map((n: Row) => (n.when as Date).getTime());
		expect(times).toEqual([...times].sort((a, b) => a - b));
	});

	it("pending is oldest first; activity is newest first with whenText", async () => {
		data.accountPendingWork.mockResolvedValue([
			pendingRow("p3", day(3)),
			pendingRow("p1", day(1)),
			pendingRow("p2", day(2)),
		]);
		data.accountActivity.mockResolvedValue([
			event("e1", day(1)),
			event("e3", day(3)),
			event("e2", day(2)),
		]);
		const slug = member().slug;
		const r = await run([member(ACCOUNT)]);
		expect(ids(r.pending)).toEqual([`${slug}:p1`, `${slug}:p2`, `${slug}:p3`]);
		expect(ids(r.activity)).toEqual([`${slug}:e3`, `${slug}:e2`, `${slug}:e1`]);
		for (const e of r.activity) expect(e.whenText).toEqual(expect.any(String));
		expect(r.activity[0].meta).toBe("Pat added the stem Bass");
		expect(r.pending[0].meta).toBe("Rendering the demo Rough");
	});
});

describe("dashboard load: chats, comments and the inbox", () => {
	it("chats merge song and session chats across accounts, latest first", async () => {
		data.unreadSongChats.mockImplementation(async (accountId: string) =>
			accountId === ACCOUNT ? [songChatRow("song-a", day(2))] : [songChatRow("song-b", day(5))],
		);
		data.unreadSessionChats.mockImplementation(async (accountId: string) =>
			accountId === ACCOUNT
				? [
						{
							...sessionRow("sess-a", "2026-10-03"),
							sessionId: "sess-a",
							href: "/sa",
							unread: 2,
							latest: day(4),
						},
					]
				: [],
		);
		const r = await run([member(ACCOUNT), member(OTHER_ACCOUNT)]);
		expect(r.chats.map((c: Row) => c.href)).toEqual(["/x/song-b", "/sa", "/x/song-a"]);
		expect(r.chats[0].meta).toBe("Big Project · Two");
		expect(data.unreadSongChats).toHaveBeenCalledWith(ACCOUNT, member().slug, USER);
	});

	it("comments are unread comments and mentions, newest first; digest from the inbox", async () => {
		notifications.listInbox.mockResolvedValue([
			inboxItem("c-old", "comment", day(1)),
			inboxItem("m-new", "mention", day(5)),
			inboxItem("c-read", "comment", day(6), day(7)),
			inboxItem("chat", "chat", day(8)),
		]);
		const r = await run([]);
		expect(ids(r.comments)).toEqual(["m-new", "c-old"]);
		expect(r.digest.unread).toBe(3);
		expect(ids(r.digest.newest)).toEqual(["chat", "m-new", "c-old"]);
		expect(r.digest.byKind).toEqual(
			expect.arrayContaining([
				{ kind: "comment", count: 1 },
				{ kind: "mention", count: 1 },
				{ kind: "chat", count: 1 },
			]),
		);
	});
});

describe("dashboard load: the person's own things", () => {
	it("seenAt is what touchDashboardSeen resolved", async () => {
		expect((await run([])).seenAt).toBeNull();
		const last = day(20);
		data.touchDashboardSeen.mockResolvedValue(last);
		expect((await run([])).seenAt).toBe(last);
	});

	it("ideas, loops and multitracks link into their tools", async () => {
		data.recentUserIdeas.mockImplementation(async (_user: string, kind: string) => [
			{ id: `${kind} 1`, title: `A ${kind}`, createdAt: day(3) },
		]);
		const r = await run([]);
		expect(r.ideas).toEqual([
			{ id: "idea 1", title: "A idea", href: "/idea-recorder", when: day(3) },
		]);
		expect(r.loops[0]).toMatchObject({ id: "loop 1", href: "/looper" });
		expect(r.multitracks[0]).toMatchObject({
			id: "song 1",
			href: "/multitrack-recorder?song=song%201",
		});
	});
});

describe("dashboard load: upcoming shows and practices", () => {
	it("asks for the real accounts' events from today (UTC) on and passes them through", async () => {
		const rows = [{ id: "ev1", accountSlug: "one", title: "Release show" }];
		calendar.upcomingEvents.mockResolvedValue(rows);
		const r = await run([member(ACCOUNT), member(OTHER_ACCOUNT, "owner", { actingAs: true })]);
		expect(r.upcoming).toBe(rows);
		expect(calendar.upcomingEvents).toHaveBeenCalledWith(
			[ACCOUNT],
			new Date().toISOString().slice(0, 10),
		);
		expect(r.accounts[0].accountId).toBe(ACCOUNT);
	});

	it("an account narrowed to (?account=) asks for that account alone", async () => {
		const acting = member(OTHER_ACCOUNT, "owner", { actingAs: true });
		await run([member(ACCOUNT), acting], fakeUser(), `?account=${acting.slug}`);
		expect(calendar.upcomingEvents).toHaveBeenCalledWith([OTHER_ACCOUNT], expect.any(String));
	});

	it("with no accounts, asks with none", async () => {
		expect((await run([])).upcoming).toEqual([]);
		expect(calendar.upcomingEvents).toHaveBeenCalledWith([], expect.any(String));
	});
});
