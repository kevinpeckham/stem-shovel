import { startingDrumProject } from "$lib/utils/startingDrumProject";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { callsTo, cascade, fake, reset } from "../../../tests/helpers/fakeDataLayer";

// The cascade runs for real here: a user's delete should anonymise and remove their rows.
const realCascade =
	await vi.importActual<typeof import("$lib/server/cascade")>("$lib/server/cascade");
cascade.deleteUserRows.mockImplementation(realCascade.deleteUserRows);
cascade.deleteAccountRows.mockImplementation(realCascade.deleteAccountRows);
cascade.deleteBugReportRows.mockImplementation(realCascade.deleteBugReportRows);

const {
	DEFAULT_FEATURED_SONG,
	confirmWaitlist,
	createBugReport,
	createSupportRequest,
	deleteAppSetting,
	deleteBugReport,
	deleteSupportRequest,
	deleteUser,
	featuredSong,
	getAppSetting,
	homeBeat,
	joinWaitlist,
	listBugReports,
	listFeatureRequestsPublic,
	listPublicSongs,
	listWaitlist,
	markWaitlistInvited,
	recordPlanTermsAccepted,
	removeWaitlist,
	respondToBugReport,
	setAccountFounder,
	setAppSetting,
	setBugReportApproval,
	setBugReportPriority,
	setBugReportStatus,
	setSignUpMode,
	setSupportRequestStatus,
	setUserActive,
	setUserFounder,
	setWaitlistPrefs,
	signUpMode,
	systemAdminEmails,
	systemOverview,
	userAccountsByEmail,
	userDetail,
	voteOnBugReport,
} = await import("./data");

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const MINUTE = 60_000;
const at = (ms: number) => new Date(ms);
const row = (table: Parameters<typeof fake.rows>[0], id: string) =>
	fake.rows(table).find((r) => r.id === id);

const account = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
	id,
	name,
	slug: name.toLowerCase(),
	status: "active",
	plan: "free",
	lifetimeFree: false,
	isFounder: false,
	storageLimitBytes: null,
	createdAt: at(NOW),
	...extra,
});
const user = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
	id,
	name,
	email: `${name.toLowerCase()}@example.com`,
	emailVerified: true,
	isActive: true,
	isSystemAdmin: false,
	isSuperAdmin: false,
	twoFactorEnabled: false,
	planTermsAcceptedAt: null,
	createdAt: at(NOW),
	updatedAt: at(NOW),
	...extra,
});
const member = (id: string, accountId: string, userId: string, role = "member") => ({
	id,
	accountId,
	userId,
	role,
	createdAt: at(NOW),
});
const report = (id: string, extra: Record<string, unknown> = {}) => ({
	id,
	userId: "u1",
	kind: "feature",
	title: id,
	body: "b",
	pageUrl: "",
	userAgent: "",
	contactEmail: null,
	status: "open",
	closedAt: null,
	priority: null,
	response: "",
	respondedAt: null,
	approvedAt: at(NOW),
	flags: "",
	createdAt: at(NOW),
	...extra,
});
const vote = (reportId: string, userId: string, value: number) => ({
	id: `${reportId}-${userId}`,
	reportId,
	userId,
	value,
});
const signup = (id: string, extra: Record<string, unknown> = {}) => ({
	id,
	email: `${id}@example.com`,
	name: id,
	updatesOk: false,
	status: "pending",
	confirmToken: `c-${id}`,
	manageToken: `m-${id}`,
	confirmedAt: null,
	invitedAt: null,
	inviteCodeId: null,
	source: "home",
	createdAt: at(NOW),
	...extra,
});

beforeAll(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => reset());

describe("systemOverview", () => {
	test("accounts by name with their members, song count and ready bytes; users by name with memberships and last sign-in", async () => {
		reset({
			account: [account("a1", "Band", { isFounder: true }), account("a2", "Alpha")],
			user: [user("u2", "Bob"), user("u1", "Ann")],
			accountMember: [
				member("m1", "a1", "u1", "owner"),
				member("m2", "a2", "u1"),
				member("m3", "a1", "u2"),
			],
			song: [
				{ id: "s1", accountId: "a1" },
				{ id: "s2", accountId: "a1" },
				{ id: "s3", accountId: "a2" },
			],
			stem: [
				{ id: "st1", accountId: "a1", status: "ready", sizeBytes: 100 },
				{ id: "st2", accountId: "a1", status: "ready", sizeBytes: 50 },
				{ id: "st3", accountId: "a1", status: "uploading", sizeBytes: 999 },
			],
			session: [
				{
					id: "se1",
					token: "t1",
					userId: "u1",
					expiresAt: at(NOW),
					createdAt: at(NOW - 2 * MINUTE),
				},
				{ id: "se2", token: "t2", userId: "u1", expiresAt: at(NOW), createdAt: at(NOW - MINUTE) },
			],
		});
		const o = await systemOverview();
		expect(o.accounts.map((a) => [a.name, a.songs, a.bytes, a.members])).toEqual([
			["Alpha", 1, 0, [{ role: "member", name: "Ann", email: "ann@example.com" }]],
			[
				"Band",
				2,
				150,
				[
					{ role: "owner", name: "Ann", email: "ann@example.com" },
					{ role: "member", name: "Bob", email: "bob@example.com" },
				],
			],
		]);
		expect(o.accounts[1]).toMatchObject({
			id: "a1",
			slug: "band",
			plan: "free",
			isFounder: true,
			storageLimitBytes: null,
		});
		expect(o.users.map((u) => [u.name, u.lastSignInAt, u.memberships])).toEqual([
			[
				"Ann",
				at(NOW - MINUTE),
				[
					{ account: "Alpha", slug: "alpha", role: "member", isFounder: false },
					{ account: "Band", slug: "band", role: "owner", isFounder: true },
				],
			],
			["Bob", null, [{ account: "Band", slug: "band", role: "member", isFounder: true }]],
		]);
	});
});

describe("userDetail", () => {
	test("identity, sign-in, memberships, what they made and their audit lines; null for a stranger", async () => {
		reset({
			user: [user("u1", "Ann", { twoFactorEnabled: true }), user("u2", "Bob")],
			account: [account("a1", "Band", { isFounder: true })],
			accountMember: [member("m1", "a1", "u1", "owner")],
			session: [
				{
					id: "se1",
					token: "t1",
					userId: "u1",
					expiresAt: at(NOW - 1),
					createdAt: at(NOW - 2 * MINUTE),
					updatedAt: at(NOW - MINUTE),
					ipAddress: "1.1.1.1",
					userAgent: "old",
				},
				{
					id: "se2",
					token: "t2",
					userId: "u1",
					expiresAt: at(NOW + MINUTE),
					createdAt: at(NOW - MINUTE),
					updatedAt: at(NOW - 30_000),
					ipAddress: "2.2.2.2",
					userAgent: "new",
				},
			],
			authAccount: [
				{ id: "aa1", userId: "u1", accountId: "u1", providerId: "credential", password: "hash" },
				{ id: "aa2", userId: "u1", accountId: "g", providerId: "google", password: null },
			],
			twoFactor: [{ id: "tf", userId: "u1", secret: "s", backupCodes: "" }],
			idea: [
				{ id: "i1", createdBy: "u1" },
				{ id: "i2", createdBy: "u1" },
				{ id: "i3", createdBy: "u2" },
			],
			recording: [
				{
					id: "r1",
					recordedBy: "u1",
					sizeBytes: 100,
					durationSeconds: 4,
					createdAt: at(NOW - 2 * MINUTE),
				},
				{
					id: "r2",
					recordedBy: "u1",
					sizeBytes: 50,
					durationSeconds: 6,
					createdAt: at(NOW - MINUTE),
				},
				{ id: "r3", recordedBy: "u2", sizeBytes: 1, durationSeconds: 1, createdAt: at(NOW) },
			],
			song: [{ id: "s1", createdBy: "u1" }],
			project: [
				{ id: "p1", createdBy: "u1" },
				{ id: "p2", createdBy: "u2" },
			],
			stem: [
				{ id: "st1", uploadedBy: "u1", sizeBytes: 10, createdAt: at(NOW - 3 * MINUTE) },
				{ id: "st2", uploadedBy: "u1", sizeBytes: 20, createdAt: at(NOW - 2 * MINUTE) },
			],
			songDocVersion: [{ id: "v1", createdBy: "u1", createdAt: at(NOW - MINUTE) }],
			aiRequest: [
				{ id: "ai1", userId: "u1" },
				{ id: "ai2", userId: null },
			],
			bugReport: [report("b1"), report("b2"), report("b3", { userId: "u2" })],
			invitation: [{ id: "in1", invitedBy: "u1" }],
			shareLink: [
				{ id: "sl1", createdBy: "u1" },
				{ id: "sl2", createdBy: "u1" },
			],
			inviteCode: [{ id: "ic1", createdBy: "u1" }],
			auditLog: [
				{
					id: "al1",
					userId: "u1",
					accountId: "a1",
					action: "song.create",
					createdAt: at(NOW - MINUTE),
				},
				{ id: "al2", userId: "u1", accountId: null, action: "sign-in", createdAt: at(NOW) },
				{ id: "al3", userId: "u2", accountId: "a1", action: "x", createdAt: at(NOW) },
			],
		});
		const d = await userDetail("u1");
		expect(d).toMatchObject({
			id: "u1",
			name: "Ann",
			email: "ann@example.com",
			isActive: true,
			isSystemAdmin: false,
		});
		expect(d?.signIn).toEqual({
			providers: ["credential", "google"],
			hasPassword: true,
			twoFactorEnabled: true,
			twoFactorEnrolled: true,
			lastSignInAt: at(NOW - MINUTE),
			lastSeenAt: at(NOW - 30_000),
			openSessions: 1,
			totalSessions: 2,
			lastClient: { ip: "2.2.2.2", userAgent: "new" },
		});
		expect(d?.memberships).toEqual([
			{
				role: "owner",
				account: "Band",
				slug: "band",
				status: "active",
				isFounder: true,
				since: at(NOW),
			},
		]);
		expect(d?.activity).toEqual({
			ideas: 2,
			takes: 2,
			takeBytes: 150,
			takeSeconds: 10,
			lastTakeAt: at(NOW - MINUTE),
			songs: 1,
			projects: 1,
			stems: 2,
			stemBytes: 30,
			lastStemAt: at(NOW - 2 * MINUTE),
			docVersions: 1,
			lastDocAt: at(NOW - MINUTE),
			aiRequests: 1,
			bugReports: 2,
			invitations: 1,
			shareLinks: 2,
			inviteCodes: 1,
		});
		expect(d?.audit).toEqual([
			{ id: "al2", action: "sign-in", account: null, at: at(NOW) },
			{
				id: "al1",
				action: "song.create",
				account: { name: "Band", slug: "band" },
				at: at(NOW - MINUTE),
			},
		]);
		expect(await userDetail("nope")).toBeNull();
	});
});

describe("bug reports and feature requests", () => {
	test("createBugReport stores the report with its profanity flags and a null empty contact", async () => {
		const made = await createBugReport("u1", {
			kind: "bug",
			title: "Broken",
			body: "It fails",
			pageUrl: "/x",
			userAgent: "ua",
			contactEmail: "",
		});
		expect(made).toMatchObject({
			userId: "u1",
			kind: "bug",
			title: "Broken",
			body: "It fails",
			pageUrl: "/x",
			userAgent: "ua",
			contactEmail: null,
			flags: "",
			status: "open",
			approvedAt: null,
		});
		expect(
			(
				await createBugReport("u1", {
					kind: "feature",
					title: "T",
					body: "B",
					pageUrl: "",
					userAgent: "",
					contactEmail: "me@x.com",
				})
			).contactEmail,
		).toBe("me@x.com");
	});
	test("approval, status, priority and the response, each false or null for an unknown report", async () => {
		reset({
			user: [user("u1", "Ann")],
			bugReport: [
				report("b1", { approvedAt: null, contactEmail: "c@x.com" }),
				report("b2", { userId: null }),
			],
		});
		expect(await setBugReportApproval("b1", true)).toBe(true);
		expect(row("bugReport", "b1")?.approvedAt).toEqual(at(NOW));
		expect(await setBugReportApproval("b1", false)).toBe(true);
		expect(row("bugReport", "b1")?.approvedAt).toBeNull();
		expect(await setBugReportApproval("nope", true)).toBe(false);
		expect(await setBugReportStatus("b1", "complete")).toEqual({
			id: "b1",
			kind: "feature",
			title: "b1",
			contactEmail: "c@x.com",
		});
		expect(row("bugReport", "b1")).toMatchObject({ status: "complete", closedAt: at(NOW) });
		await setBugReportStatus("b1", "open");
		expect(row("bugReport", "b1")).toMatchObject({ status: "open", closedAt: null });
		expect(await setBugReportStatus("nope", "closed")).toBeNull();
		expect(await setBugReportPriority("b1", "high")).toBe(true);
		expect(row("bugReport", "b1")?.priority).toBe("high");
		expect(await setBugReportPriority("nope", null)).toBe(false);
		expect(await respondToBugReport("b1", "Shipped")).toEqual({
			title: "b1",
			kind: "feature",
			contactEmail: "c@x.com",
			reporter: { email: "ann@example.com", name: "Ann" },
		});
		expect(row("bugReport", "b1")).toMatchObject({ response: "Shipped", respondedAt: at(NOW) });
		expect(await respondToBugReport("b2", "")).toEqual({
			title: "b2",
			kind: "feature",
			contactEmail: null,
			reporter: null,
		});
		expect(row("bugReport", "b2")?.respondedAt).toBeNull();
		expect(await respondToBugReport("nope", "x")).toBeNull();
	});
	test("listBugReports: by status then newest, with the reporter and the vote score", async () => {
		reset({
			user: [user("u1", "Ann")],
			bugReport: [
				report("old", { createdAt: at(NOW - MINUTE) }),
				report("new"),
				report("done", { status: "closed", userId: null }),
			],
			bugReportVote: [vote("old", "u1", 1), vote("old", "u2", 1), vote("new", "u1", -1)],
		});
		// Open ones first (the status column alone would sort "closed" before "open"), newest first within a status.
		expect((await listBugReports()).map((r) => [r.id, r.score, r.reporter])).toEqual([
			["new", -1, { name: "Ann", email: "ann@example.com" }],
			["old", 2, { name: "Ann", email: "ann@example.com" }],
			["done", 0, null],
		]);
	});
	test("voteOnBugReport keeps one vote per person: a change updates it, none withdraws it", async () => {
		reset({ bugReport: [report("b1")], bugReportVote: [vote("b1", "u2", 1)] });
		expect(await voteOnBugReport("nope", "u1", "up")).toBeNull();
		expect(await voteOnBugReport("b1", "u1", "up")).toEqual({
			up: 2,
			down: 0,
			score: 2,
			mine: "up",
		});
		expect(await voteOnBugReport("b1", "u1", "down")).toEqual({
			up: 1,
			down: 1,
			score: 0,
			mine: "down",
		});
		expect(fake.rows("bugReportVote")).toHaveLength(2);
		expect(fake.rows("bugReportVote").find((v) => v.userId === "u1")?.value).toBe(-1);
		expect(await voteOnBugReport("b1", "u1", "none")).toEqual({
			up: 1,
			down: 0,
			score: 1,
			mine: "none",
		});
		expect(fake.rows("bugReportVote").map((v) => v.userId)).toEqual(["u2"]);
	});
	test("listFeatureRequestsPublic: approved requests for everyone, plus one's own while pending, all for an admin; by score", async () => {
		reset({
			bugReport: [
				report("f1", { createdAt: at(NOW - MINUTE) }),
				report("f2"),
				report("f3", { approvedAt: null, userId: "u1" }),
				report("f4", { approvedAt: null, userId: "u2" }),
				report("bug", { kind: "bug" }),
			],
			bugReportVote: [vote("f1", "u1", 1), vote("f1", "u2", 1), vote("f2", "u1", -1)],
		});
		expect(
			(await listFeatureRequestsPublic(null)).map((r) => [
				r.id,
				r.votes.score,
				r.votes.mine,
				r.mine,
				r.approved,
			]),
		).toEqual([
			["f1", 2, "none", false, true],
			["f2", -1, "none", false, true],
		]);
		expect((await listFeatureRequestsPublic("u1")).map((r) => [r.id, r.votes, r.mine])).toEqual([
			["f1", { up: 2, down: 0, score: 2, mine: "up" }, true],
			["f3", { up: 0, down: 0, score: 0, mine: "none" }, true],
			["f2", { up: 0, down: 1, score: -1, mine: "down" }, true],
		]);
		expect((await listFeatureRequestsPublic("u2", true)).map((r) => r.id)).toEqual([
			"f1",
			"f3",
			"f4",
			"f2",
		]);
		expect(Object.keys((await listFeatureRequestsPublic(null))[0])).not.toContain("userId");
	});
	test("deleteBugReport removes the report and its votes", async () => {
		reset({
			bugReport: [report("b1"), report("b2")],
			bugReportVote: [vote("b1", "u1", 1), vote("b2", "u1", 1)],
		});
		expect(await deleteBugReport("nope")).toBe(false);
		expect(await deleteBugReport("b1")).toBe(true);
		expect(fake.rows("bugReport").map((r) => r.id)).toEqual(["b2"]);
		expect(fake.rows("bugReportVote").map((v) => v.reportId)).toEqual(["b2"]);
	});
});

describe("support requests", () => {
	test("userAccountsByEmail: the person with their active accounts; null for an unknown address", async () => {
		reset({
			user: [user("u1", "Ann")],
			account: [account("a1", "Band"), account("a2", "Gone", { status: "suspended" })],
			accountMember: [member("m1", "a1", "u1"), member("m2", "a2", "u1")],
		});
		expect(await userAccountsByEmail("ann@example.com")).toEqual({
			id: "u1",
			name: "Ann",
			email: "ann@example.com",
			isActive: true,
			accounts: [{ id: "a1", name: "Band" }],
		});
		expect(await userAccountsByEmail("zed@example.com")).toBeNull();
	});
	test("a request is stored as given; closing stamps it, reopening clears it; deleting", async () => {
		const input = {
			email: "ann@example.com",
			userId: "u1",
			accountId: "a1",
			message: "Help",
			verifiedBy: "signed-in" as const,
			ipAddress: "1.1.1.1",
			userAgent: "ua",
		};
		const made = await createSupportRequest(input);
		expect(made).toMatchObject({ ...input, status: "open", closedAt: null });
		expect(await setSupportRequestStatus(made.id, "closed")).toBe(true);
		expect(row("supportRequest", made.id)).toMatchObject({ status: "closed", closedAt: at(NOW) });
		expect(await setSupportRequestStatus(made.id, "open")).toBe(true);
		expect(row("supportRequest", made.id)?.closedAt).toBeNull();
		expect(await setSupportRequestStatus("nope", "open")).toBe(false);
		expect(await deleteSupportRequest("nope")).toBe(false);
		expect(await deleteSupportRequest(made.id)).toBe(true);
		expect(fake.rows("supportRequest")).toEqual([]);
	});
});

describe("users and founders", () => {
	test("systemAdminEmails: active system admins only", async () => {
		reset({
			user: [
				user("u1", "Ann", { isSystemAdmin: true }),
				user("u2", "Bob", { isSystemAdmin: true, isActive: false }),
				user("u3", "Cal"),
			],
		});
		expect(await systemAdminEmails()).toEqual(["ann@example.com"]);
	});
	test("setUserActive: suspending signs the user out everywhere; reactivating only lifts the flag", async () => {
		reset({
			user: [user("u1", "Ann")],
			session: [
				{ id: "se1", token: "t1", userId: "u1", expiresAt: at(NOW) },
				{ id: "se2", token: "t2", userId: "u2", expiresAt: at(NOW) },
			],
		});
		expect(await setUserActive("u1", false)).toBe(true);
		expect(row("user", "u1")?.isActive).toBe(false);
		expect(fake.rows("session").map((s) => s.id)).toEqual(["se2"]);
		expect(await setUserActive("u1", true)).toBe(true);
		expect(callsTo("delete", "session")).toHaveLength(1);
		expect(await setUserActive("nope", false)).toBe(false);
	});
	test("deleteUser removes the person and anonymises what they made; an emptied account without projects goes too", async () => {
		reset({
			user: [user("u1", "Ann"), user("u2", "Bob")],
			account: [account("a1", "Solo"), account("a2", "Band"), account("a3", "Works")],
			accountMember: [
				member("m1", "a1", "u1", "owner"),
				member("m2", "a2", "u1"),
				member("m3", "a2", "u2"),
				member("m4", "a3", "u1", "owner"),
			],
			project: [{ id: "p1", accountId: "a3", createdBy: "u1", slug: "p" }],
			comment: [
				{ id: "c1", accountId: "a2", songId: "s1", userId: "u1" },
				{ id: "c2", accountId: "a2", songId: "s1", userId: "u2" },
			],
			idea: [{ id: "i1", accountId: "a2", createdBy: "u1" }],
			session: [{ id: "se1", token: "t", userId: "u1", expiresAt: at(NOW) }],
		});
		expect(await deleteUser("nope")).toBeNull();
		expect(await deleteUser("u1")).toEqual({ accountsRemoved: 1 });
		expect(fake.rows("user").map((u) => u.id)).toEqual(["u2"]);
		expect(fake.rows("accountMember").map((m) => m.id)).toEqual(["m3"]);
		expect(fake.rows("account").map((a) => a.id)).toEqual(["a2", "a3"]);
		expect(fake.rows("comment").map((c) => c.id)).toEqual(["c2"]);
		expect(row("idea", "i1")?.createdBy).toBeNull();
		expect(row("project", "p1")?.createdBy).toBeNull();
		expect(fake.rows("session")).toEqual([]);
	});
	test("setUserFounder marks the accounts the user owns, not those they merely belong to; setAccountFounder one account", async () => {
		reset({
			account: [account("a1", "Own"), account("a2", "Member"), account("a3", "Other")],
			accountMember: [
				member("m1", "a1", "u1", "owner"),
				member("m2", "a2", "u1"),
				member("m3", "a3", "u2", "owner"),
			],
		});
		expect(await setUserFounder("u1", true)).toBe(1);
		expect(fake.rows("account").map((a) => [a.id, a.isFounder])).toEqual([
			["a1", true],
			["a2", false],
			["a3", false],
		]);
		expect(await setUserFounder("u2", true)).toBe(1);
		expect(await setUserFounder("nobody", true)).toBe(0);
		expect(await setAccountFounder("a2", true)).toBe(true);
		expect(row("account", "a2")?.isFounder).toBe(true);
		expect(await setAccountFounder("nope", true)).toBe(false);
	});
	test("recordPlanTermsAccepted stamps the user", async () => {
		reset({ user: [user("u1", "Ann")] });
		await recordPlanTermsAccepted("u1");
		expect(row("user", "u1")?.planTermsAcceptedAt).toEqual(at(NOW));
	});
});

describe("app settings", () => {
	test("get, set (an upsert) and delete", async () => {
		expect(await getAppSetting("k")).toBeNull();
		await setAppSetting("k", "one");
		await setAppSetting("k", "two");
		expect(await getAppSetting("k")).toBe("two");
		expect(fake.rows("appSetting").map((r) => [r.key, r.value])).toEqual([["k", "two"]]);
		await deleteAppSetting("k");
		expect(await getAppSetting("k")).toBeNull();
	});
	test("signUpMode is open unless set to invite, and cached for a moment after a read", async () => {
		await setSignUpMode("invite");
		expect(await signUpMode()).toBe("invite");
		await deleteAppSetting("signUpMode");
		const reads = () => fake.calls.filter((c) => c.op === "findFirst" && c.table === "app_setting");
		const before = reads().length;
		expect(await signUpMode()).toBe("invite");
		expect(reads()).toHaveLength(before);
		await setSignUpMode("open");
		expect(await signUpMode()).toBe("open");
		expect(row("appSetting", "k")).toBeUndefined();
	});
	test("homeBeat: null until set, for bad JSON or a project off the schema; the project otherwise", async () => {
		expect(await homeBeat()).toBeNull();
		await setAppSetting("homeBeat", "{nope");
		expect(await homeBeat()).toBeNull();
		await setAppSetting("homeBeat", JSON.stringify({ v: 99 }));
		expect(await homeBeat()).toBeNull();
		await setAppSetting("homeBeat", JSON.stringify(startingDrumProject()));
		expect(await homeBeat()).toEqual(startingDrumProject());
	});
});

describe("the home page's song", () => {
	const publicSong = (id: string, projectId: string, extra: Record<string, unknown> = {}) => ({
		id,
		accountId: "a1",
		projectId,
		title: id,
		slug: id,
		version: "1.0.0",
		isPrivate: false,
		status: "active",
		...extra,
	});
	const stage = {
		account: [
			account("a1", "Band"),
			account("a2", "Gone", { status: "suspended" }),
			account("mmkk", "MMKK", { slug: DEFAULT_FEATURED_SONG.account }),
		],
		project: [
			{
				id: "p1",
				accountId: "a1",
				name: "Public",
				slug: "public",
				isPrivate: false,
				isRestricted: false,
				status: "active",
				noAi: false,
			},
			{
				id: "p2",
				accountId: "a1",
				name: "Private",
				slug: "private",
				isPrivate: true,
				isRestricted: false,
				status: "active",
				noAi: false,
			},
			{
				id: "p3",
				accountId: "a1",
				name: "Archived",
				slug: "archived",
				isPrivate: false,
				isRestricted: false,
				status: "archived",
				noAi: false,
			},
			{
				id: "p4",
				accountId: "a2",
				name: "Theirs",
				slug: "theirs",
				isPrivate: false,
				isRestricted: false,
				status: "active",
				noAi: false,
			},
			{
				id: "pd",
				accountId: "mmkk",
				name: "Bad Verbs",
				slug: DEFAULT_FEATURED_SONG.project,
				isPrivate: false,
				isRestricted: false,
				status: "active",
				noAi: false,
			},
		],
		song: [
			publicSong("zeta", "p1"),
			publicSong("alpha", "p1"),
			publicSong("hidden", "p1", { isPrivate: true }),
			publicSong("silent", "p1"),
			publicSong("in-private", "p2"),
			publicSong("in-archived", "p3"),
			publicSong("theirs", "p4", { accountId: "a2" }),
			publicSong("clocks", "pd", { accountId: "mmkk", slug: DEFAULT_FEATURED_SONG.song }),
		],
		stem: [
			{ id: "st1", accountId: "a1", songId: "zeta", status: "ready", sortOrder: 0 },
			{ id: "st2", accountId: "a1", songId: "zeta", status: "ready", sortOrder: 1 },
			{ id: "st3", accountId: "a1", songId: "zeta", status: "uploading", sortOrder: 2 },
			{ id: "st4", accountId: "a1", songId: "alpha", status: "ready", sortOrder: 0 },
			{ id: "st5", accountId: "a1", songId: "hidden", status: "ready", sortOrder: 0 },
			{ id: "st6", accountId: "a1", songId: "in-private", status: "ready", sortOrder: 0 },
			{ id: "st7", accountId: "a1", songId: "in-archived", status: "ready", sortOrder: 0 },
			{ id: "st8", accountId: "a2", songId: "theirs", status: "ready", sortOrder: 0 },
			{ id: "st9", accountId: "mmkk", songId: "clocks", status: "ready", sortOrder: 0 },
		],
	};
	test("listPublicSongs: public, playable songs of active projects and accounts, by account then title", async () => {
		reset(stage);
		expect(await listPublicSongs()).toEqual([
			{
				id: "alpha",
				title: "alpha",
				version: "1.0.0",
				project: "Public",
				account: "Band",
				path: "/band/projects/public/alpha",
				stems: 1,
			},
			{
				id: "zeta",
				title: "zeta",
				version: "1.0.0",
				project: "Public",
				account: "Band",
				path: "/band/projects/public/zeta",
				stems: 2,
			},
			{
				id: "clocks",
				title: "clocks",
				version: "1.0.0",
				project: "Bad Verbs",
				account: "MMKK",
				path: `/mmkk/projects/badverbs/${DEFAULT_FEATURED_SONG.song}`,
				stems: 1,
			},
		]);
	});
	test("featuredSong: the chosen song while it is public, else the default, else nothing", async () => {
		reset(stage);
		await setAppSetting("featuredSongId", "zeta");
		expect(await featuredSong()).toMatchObject({
			id: "zeta",
			accountSlug: "band",
			project: { slug: "public" },
			stems: [{ id: "st1" }, { id: "st2" }, { id: "st3" }],
		});
		await setAppSetting("featuredSongId", "hidden");
		expect(await featuredSong()).toMatchObject({ id: "clocks", accountSlug: "mmkk" });
		await setAppSetting("featuredSongId", "in-private");
		expect(await featuredSong()).toMatchObject({ id: "clocks" });
		reset({ ...stage, account: stage.account.slice(0, 2) });
		expect(await featuredSong()).toBeNull();
	});
});

describe("the waitlist", () => {
	test("joinWaitlist: a new address gets tokens and owes a confirmation; a pending one is refreshed; a confirmed one needs nothing; a removed one is revived", async () => {
		reset({
			waitlistSignup: [
				signup("pending", { updatesOk: true }),
				signup("confirmed", { status: "confirmed" }),
				signup("removed", { status: "removed" }),
			],
		});
		const fresh = await joinWaitlist({
			email: "new@example.com",
			name: "New",
			updatesOk: true,
			source: "blog",
		});
		expect(fresh.next).toBe("confirm");
		expect(fresh.row).toMatchObject({
			email: "new@example.com",
			name: "New",
			updatesOk: true,
			status: "pending",
			source: "blog",
		});
		expect((fresh.row.confirmToken as string).length).toBe(32);
		expect((fresh.row.manageToken as string).length).toBe(32);
		const again = await joinWaitlist({
			email: "pending@example.com",
			name: "",
			updatesOk: false,
			source: "x",
		});
		expect(again.next).toBe("confirm");
		expect(again.row).toMatchObject({
			id: "pending",
			name: "pending",
			updatesOk: true,
			status: "pending",
			manageToken: "m-pending",
		});
		expect(again.row.confirmToken).not.toBe("c-pending");
		expect(
			await joinWaitlist({
				email: "confirmed@example.com",
				name: "",
				updatesOk: false,
				source: "x",
			}),
		).toMatchObject({ next: "already", row: { id: "confirmed" } });
		expect(
			await joinWaitlist({ email: "removed@example.com", name: "", updatesOk: false, source: "x" }),
		).toMatchObject({ next: "confirm", row: { id: "removed", status: "pending" } });
		expect(fake.rows("waitlistSignup")).toHaveLength(4);
	});
	test("confirmWaitlist takes a pending token once; setWaitlistPrefs by the manage token", async () => {
		reset({ waitlistSignup: [signup("w1")] });
		expect(await confirmWaitlist("c-nope")).toBeNull();
		expect(await confirmWaitlist("c-w1")).toMatchObject({
			id: "w1",
			status: "confirmed",
			confirmedAt: at(NOW),
		});
		expect(await confirmWaitlist("c-w1")).toBeNull();
		expect(await setWaitlistPrefs("m-w1", "updates-on")).toMatchObject({ updatesOk: true });
		expect(await setWaitlistPrefs("m-w1", "updates-off")).toMatchObject({ updatesOk: false });
		expect(await setWaitlistPrefs("m-w1", "leave")).toMatchObject({
			status: "removed",
			updatesOk: false,
		});
		expect(await setWaitlistPrefs("m-nope", "leave")).toBeNull();
	});
	test("listWaitlist: confirmed, pending, invited, removed, newest first within each, with the invite sent", async () => {
		reset({
			inviteCode: [{ id: "ic1", code: "ABCD", uses: 1, maxUses: 1, revokedAt: null }],
			waitlistSignup: [
				signup("p-old", { createdAt: at(NOW - MINUTE) }),
				signup("p-new"),
				signup("gone", { status: "removed" }),
				signup("in", { status: "invited", inviteCodeId: "ic1" }),
				signup("ok", { status: "confirmed" }),
			],
		});
		const list = await listWaitlist();
		expect(list.map((w) => w.id)).toEqual(["ok", "p-new", "p-old", "in", "gone"]);
		expect(list[3].inviteCode).toEqual({ code: "ABCD", uses: 1, maxUses: 1, revokedAt: null });
		expect(list[0].inviteCode).toBeNull();
	});
	test("markWaitlistInvited keeps the code; removeWaitlist deletes the entry", async () => {
		reset({ waitlistSignup: [signup("w1", { status: "confirmed" })] });
		await markWaitlistInvited("w1", "ic1");
		expect(row("waitlistSignup", "w1")).toMatchObject({
			status: "invited",
			invitedAt: at(NOW),
			inviteCodeId: "ic1",
		});
		expect(await removeWaitlist("nope")).toBe(false);
		expect(await removeWaitlist("w1")).toBe(true);
		expect(fake.rows("waitlistSignup")).toEqual([]);
	});
});
