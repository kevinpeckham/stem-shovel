import { FOUNDER_SEATS, PLAN_LIMITS } from "#lib/constants/plans.js";
import { INVITATION_TTL_MS } from "#lib/val/InvitationSchema.js";
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from "#lib/val/InviteCodeSchema.js";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { blob, callsTo, cascade, fake, reset } from "../../../tests/helpers/fakeDataLayer";

const {
	acceptInvitation,
	accountLimitsOf,
	accountStorageBytes,
	accountUsage,
	accountsOf,
	createInvitation,
	createInviteCode,
	createOwnedAccount,
	deleteAccount,
	inviteCodeByCode,
	invitationByToken,
	listInviteCodes,
	logAudit,
	memberHeadroom,
	redeemInviteCode,
	removeMembership,
	reservedPathname,
	revokeInvitation,
	revokeInviteCode,
	setAccountStatus,
	setAccountStorageLimit,
	setImage,
	setMemberRole,
	storageRoom,
} = await import("./data");

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const at = (ms: number) => new Date(ms);
const FREE = PLAN_LIMITS.free;
const a1 = {
	id: "a1",
	name: "Band",
	slug: "band",
	plan: "free",
	isFounder: false,
	status: "active",
	lifetimeFree: true,
};
const u1 = { id: "u1", name: "Ann", email: "ann@example.com" };
const u2 = { id: "u2", name: "Bob", email: "bob@example.com" };
const member = (id: string, userId: string, role = "member", accountId = "a1") => ({
	id,
	accountId,
	userId,
	role,
});
/** n members x0…, each with a user row, filling the account's seats. */
const seats = (n: number, accountId = "a1") => ({
	user: Array.from({ length: n }, (_, i) => ({ id: `x${i}`, name: `X${i}`, email: `x${i}@e.com` })),
	accountMember: Array.from({ length: n }, (_, i) =>
		member(`${accountId}m${i}`, `x${i}`, "member", accountId),
	),
});

beforeAll(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => reset());

describe("accountLimitsOf", () => {
	test("the plan's limits, an admin's storage override, nothing for a founder, null for a stranger", async () => {
		reset({
			account: [
				a1,
				{ ...a1, id: "a2", storageLimitBytes: 5_000 },
				{ ...a1, id: "a3", isFounder: true, storageLimitBytes: 5_000 },
			],
		});
		expect(await accountLimitsOf("a1")).toEqual({
			storageBytes: FREE.storageBytes,
			members: FREE.members,
		});
		expect(await accountLimitsOf("a2")).toEqual({ storageBytes: 5_000, members: FREE.members });
		expect(await accountLimitsOf("a3")).toEqual({ storageBytes: null, members: null });
		expect(await accountLimitsOf("nope")).toBeNull();
	});
});

describe("accountStorageBytes", () => {
	test("sums every table of user files, counting uploads in flight, not failed rows nor another account's", async () => {
		const mine = (sizeBytes: number, status = "ready") => ({ accountId: "a1", sizeBytes, status });
		reset({
			stem: [
				mine(1),
				mine(2, "uploading"),
				mine(1000, "failed"),
				{ ...mine(1000), accountId: "a2" },
			],
			demo: [mine(10)],
			songMix: [mine(20), mine(7, "failed")],
			recording: [mine(100)],
			recordingStem: [mine(1_000)],
			studioSource: [mine(10_000)],
			drumSample: [mine(100_000)],
			songFile: [mine(1_000_000)],
			songNotation: [mine(10_000_000), mine(5, "failed")],
		});
		expect(await accountStorageBytes("a1")).toBe(11_111_133);
		expect(fake.calls.filter((c) => c.op === "select").map((c) => c.table)).toEqual([
			"stem",
			"demo",
			"song_mix",
			"recording",
			"recording_stem",
			"studio_source",
			"drum_sample",
			"song_pdf",
			"song_notation",
		]);
	});
	test("an account with nothing holds 0", async () => {
		expect(await accountStorageBytes("a1")).toBe(0);
	});
});

describe("storageRoom", () => {
	test("a founder (no limit) fits without counting; a plan account fits up to the line exactly", async () => {
		reset({
			account: [
				{ ...a1, storageLimitBytes: 1_000 },
				{ ...a1, id: "f", isFounder: true },
			],
			stem: [{ accountId: "a1", sizeBytes: 600, status: "ready" }],
		});
		expect(await storageRoom("f", 1e12)).toEqual({ ok: true });
		expect(fake.calls.filter((c) => c.op === "select")).toEqual([]);
		expect(await storageRoom("a1", 400)).toEqual({ ok: true });
		expect(await storageRoom("a1", 401)).toEqual({ ok: false, used: 600, limit: 1_000 });
	});
	test("an unknown account has no room", async () => {
		expect(await storageRoom("nope", 5)).toEqual({ ok: false, used: 0, limit: 0 });
	});
});

describe("memberHeadroom", () => {
	test("every account_member row is a seat; full at the plan's cap, never for a founder", async () => {
		reset({
			account: [a1, { ...a1, id: "f", isFounder: true }],
			accountMember: [
				...seats(FREE.members - 1).accountMember,
				...seats(FREE.members + 1, "f").accountMember,
			],
		});
		expect(await memberHeadroom("a1")).toEqual({
			members: FREE.members - 1,
			limit: FREE.members,
			full: false,
		});
		expect(await memberHeadroom("f")).toEqual({
			members: FREE.members + 1,
			limit: null,
			full: false,
		});
		reset({ account: [a1], ...seats(FREE.members) });
		expect(await memberHeadroom("a1")).toMatchObject({ members: FREE.members, full: true });
	});
});

describe("setAccountStorageLimit", () => {
	test("writes the override (or clears it) on that account alone", async () => {
		reset({ account: [a1, { ...a1, id: "a2" }] });
		expect(await setAccountStorageLimit("a1", 9_000)).toBe(true);
		expect(fake.rows("account").map((a) => a.storageLimitBytes)).toEqual([9_000, undefined]);
		expect(await setAccountStorageLimit("a1", null)).toBe(true);
		expect(fake.rows("account")[0].storageLimitBytes).toBeNull();
		expect(await setAccountStorageLimit("nope", 1)).toBe(false);
	});
});

describe("accountUsage", () => {
	test("counts and ready bytes of the account, its members and limits", async () => {
		const ready = (sizeBytes: number, status = "ready") => ({ accountId: "a1", sizeBytes, status });
		reset({
			account: [{ ...a1, createdAt: at(NOW) }],
			user: [u1, u2],
			accountMember: [member("m1", "u1", "owner"), member("m2", "u2")],
			project: [{ accountId: "a1" }, { accountId: "a1" }, { accountId: "a2" }],
			song: [{ accountId: "a1" }],
			stem: [ready(1), ready(2), ready(100, "uploading")],
			recording: [ready(10)],
			recordingStem: [ready(100)],
			studioSource: [ready(1_000)],
			demo: [ready(10_000), ready(10_000, "failed")],
			songMix: [ready(100_000), ready(5, "uploading")],
		});
		expect(await accountUsage("a1")).toEqual({
			projects: 2,
			songs: 1,
			stems: 2,
			recordings: 1,
			demos: 1,
			mixes: 1,
			bytes: 111_113,
			storageLimitBytes: FREE.storageBytes,
			memberLimit: FREE.members,
			isFounder: false,
			members: [
				{ userId: "u1", role: "owner", name: "Ann", email: "ann@example.com" },
				{ userId: "u2", role: "member", name: "Bob", email: "bob@example.com" },
			],
			createdAt: at(NOW),
		});
	});
	test("an unknown account is empty and unlimited", async () => {
		expect(await accountUsage("nope")).toEqual({
			projects: 0,
			songs: 0,
			stems: 0,
			recordings: 0,
			demos: 0,
			mixes: 0,
			bytes: 0,
			storageLimitBytes: null,
			memberLimit: null,
			isFounder: false,
			members: [],
			createdAt: null,
		});
	});
});

describe("setAccountStatus", () => {
	test("sets the status; a stranger is false", async () => {
		reset({ account: [a1] });
		expect(await setAccountStatus("a1", "suspended")).toBe(true);
		expect(fake.rows("account")[0].status).toBe("suspended");
		expect(await setAccountStatus("nope", "active")).toBe(false);
	});
});

describe("deleteAccount", () => {
	test("collects every file of the account, deletes them, then hands the rows to the cascade", async () => {
		reset({
			account: [
				{ ...a1, imageUrl: "img/a" },
				{ ...a1, id: "a2", imageUrl: "img/a2" },
			],
			stem: [
				{ accountId: "a1", url: "s1", playbackUrl: "s1p", midiUrl: "s1m" },
				{ accountId: "a1", url: "s2" },
				{ accountId: "a2", url: "other" },
			],
			demo: [{ accountId: "a1", url: "d1", playbackUrl: "d1p" }],
			song: [{ accountId: "a1", mixUrl: "mix" }, { accountId: "a1" }],
			project: [{ accountId: "a1", imageUrl: "img/p" }],
			artist: [{ accountId: "a1", imageUrl: null }],
			recording: [{ accountId: "a1", url: "r1", playbackUrl: null }],
			drumSample: [{ accountId: "a1", url: "k1" }],
		});
		expect(await deleteAccount("a1")).toBe(true);
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"s1",
			"s1p",
			"s1m",
			"s2",
			"",
			"",
			"d1",
			"d1p",
			"r1",
			"",
			"k1",
			"mix",
			"",
			"img/p",
			"",
			"img/a",
		]);
		expect(cascade.deleteAccountRows).toHaveBeenCalledWith("a1");
	});
	test("an unknown account is false and nothing is cascaded", async () => {
		reset({ account: [a1] });
		expect(await deleteAccount("nope")).toBe(false);
		expect(cascade.deleteAccountRows).not.toHaveBeenCalled();
	});
});

describe("createOwnedAccount", () => {
	test("slug from the name, made unique against live and former account slugs; the user owns it", async () => {
		reset({
			account: [{ ...a1, slug: "the-band" }],
			slugAlias: [{ kind: "account", scopeId: "", slug: "the-band-2", targetId: "x" }],
		});
		const made = await createOwnedAccount("u1", "The Band");
		expect(made).toMatchObject({ name: "The Band", slug: "the-band-3", isFounder: true });
		expect(callsTo("insert", "account_member")[0].values).toEqual({
			accountId: made.id,
			userId: "u1",
			role: "owner",
		});
	});
	test("founder seats go to the first FOUNDER_SEATS accounts only", async () => {
		reset({
			account: Array.from({ length: FOUNDER_SEATS }, (_, i) => ({
				...a1,
				id: `a${i}`,
				slug: `s${i}`,
			})),
		});
		expect((await createOwnedAccount("u1", "Late")).isFounder).toBe(false);
		reset({ account: [] });
		expect((await createOwnedAccount("u1", "   ")).slug).toBe("account");
	});
});

describe("accountsOf", () => {
	test("every membership with the account, its active project count and whether the member may leave, by name", async () => {
		reset({
			account: [
				{ ...a1, name: "Zed", createdAt: at(NOW) },
				{ ...a1, id: "a2", name: "Alpha", slug: "alpha", createdAt: at(NOW) },
				{ ...a1, id: "a3", name: "Nope", slug: "nope", createdAt: at(NOW) },
			],
			accountMember: [
				member("m1", "u1", "owner"),
				member("m2", "u2", "owner"),
				member("m3", "u1", "owner", "a2"),
				member("m4", "u2", "member", "a3"),
			],
			project: [
				{ accountId: "a1", status: "active" },
				{ accountId: "a1", status: "archived" },
				{ accountId: "a3", status: "active" },
			],
		});
		expect(await accountsOf("u1")).toEqual([
			{
				accountId: "a2",
				name: "Alpha",
				slug: "alpha",
				status: "active",
				plan: "free",
				lifetimeFree: true,
				isFounder: false,
				role: "owner",
				projects: 0,
				canLeave: false,
			},
			{
				accountId: "a1",
				name: "Zed",
				slug: "band",
				status: "active",
				plan: "free",
				lifetimeFree: true,
				isFounder: false,
				role: "owner",
				projects: 1,
				canLeave: true,
			},
		]);
		expect((await accountsOf("u2")).map((m) => [m.accountId, m.canLeave])).toEqual([
			["a3", true],
			["a1", true],
		]);
	});
});

describe("removeMembership", () => {
	test("a member goes; the last owner stays; a stranger is an error", async () => {
		reset({ accountMember: [member("m1", "u1", "owner"), member("m2", "u2")] });
		expect(await removeMembership("a1", "u1")).toEqual({
			ok: false,
			error: "The last owner cannot leave. Make someone else an owner first.",
		});
		expect(await removeMembership("a1", "u3")).toEqual({ ok: false, error: "Not a member." });
		expect(await removeMembership("a1", "u2")).toEqual({ ok: true, role: "member" });
		expect(fake.rows("accountMember").map((m) => m.id)).toEqual(["m1"]);
	});
	test("an owner leaves when another owner remains", async () => {
		reset({ accountMember: [member("m1", "u1", "owner"), member("m2", "u2", "owner")] });
		expect(await removeMembership("a1", "u1")).toEqual({ ok: true, role: "owner" });
	});
});

describe("setMemberRole", () => {
	test("the last owner cannot be demoted, but can be 'promoted' to owner; others change freely", async () => {
		reset({ accountMember: [member("m1", "u1", "owner"), member("m2", "u2")] });
		expect(await setMemberRole("a1", "u1", "admin")).toEqual({
			ok: false,
			error: "The last owner cannot be demoted. Make someone else an owner first.",
		});
		expect(await setMemberRole("a1", "u1", "owner")).toEqual({ ok: true, previous: "owner" });
		expect(await setMemberRole("a1", "u2", "admin")).toEqual({ ok: true, previous: "member" });
		expect(fake.rows("accountMember").map((m) => m.role)).toEqual(["owner", "admin"]);
		expect(await setMemberRole("a1", "u9", "admin")).toEqual({ ok: false, error: "Not a member." });
	});
	test("with two owners either may step down", async () => {
		reset({ accountMember: [member("m1", "u1", "owner"), member("m2", "u2", "owner")] });
		expect(await setMemberRole("a1", "u1", "member")).toEqual({ ok: true, previous: "owner" });
	});
});

describe("logAudit", () => {
	test("writes the line", async () => {
		await logAudit({ userId: "u1", accountId: "a1", action: "POST /x" });
		expect(fake.rows("auditLog")[0]).toMatchObject({
			userId: "u1",
			accountId: "a1",
			action: "POST /x",
		});
	});
});

describe("reservedPathname", () => {
	test("each kind reads its own table, scoped to the account; a stem's midi is its midiPathname", async () => {
		reset({
			stem: [{ id: "x", accountId: "a1", pathname: "p/stem", midiPathname: "p/midi" }],
			demo: [{ id: "x", accountId: "a1", pathname: "p/demo" }],
			recording: [{ id: "x", accountId: "a1", pathname: "p/rec" }],
			recordingStem: [{ id: "x", accountId: "a1", pathname: "p/recstem" }],
			songFile: [{ id: "x", accountId: "a1", pathname: "p/file" }],
			songNotation: [{ id: "x", accountId: "a2", pathname: "p/notation" }],
		});
		expect(await reservedPathname("a1", "stem", "x")).toBe("p/stem");
		expect(await reservedPathname("a1", "midi", "x")).toBe("p/midi");
		expect(await reservedPathname("a1", "demo", "x")).toBe("p/demo");
		expect(await reservedPathname("a1", "recording", "x")).toBe("p/rec");
		expect(await reservedPathname("a1", "recording-stem", "x")).toBe("p/recstem");
		expect(await reservedPathname("a1", "file", "x")).toBe("p/file");
		expect(await reservedPathname("a1", "notation", "x")).toBeNull();
		expect(await reservedPathname("a2", "stem", "x")).toBeNull();
	});
});

describe("setImage", () => {
	test("account: only its own id, answering the picture it replaces", async () => {
		reset({ account: [{ ...a1, imageUrl: "old" }] });
		expect(await setImage("account", "a1", "a2", "new")).toBeUndefined();
		expect(await setImage("account", "a1", "a1", "new")).toBe("old");
		expect(fake.rows("account")[0].imageUrl).toBe("new");
		expect(await setImage("account", "nope", "nope", "new")).toBeUndefined();
	});
	test("artist and project: scoped to the account", async () => {
		reset({
			artist: [{ id: "ar", accountId: "a1", imageUrl: null }],
			project: [{ id: "p", accountId: "a2", imageUrl: "pic" }],
		});
		expect(await setImage("artist", "a1", "ar", "x")).toBeNull();
		expect(fake.rows("artist")[0].imageUrl).toBe("x");
		expect(await setImage("project", "a1", "p", "x")).toBeUndefined();
		expect(await setImage("project", "a2", "p", null)).toBe("pic");
		expect(fake.rows("project")[0].imageUrl).toBeNull();
	});
});

describe("createInvitation", () => {
	beforeEach(() =>
		reset({
			account: [a1],
			user: [u1, u2],
			accountMember: [member("m1", "u1", "owner")],
			project: [{ id: "p1", accountId: "a1" }],
			projectMember: [{ id: "pm1", projectId: "p1", userId: "u2", role: "viewer" }],
		}),
	);
	test("into the account: the row with a 32-char token and a 14-day expiry, address lower-cased", async () => {
		const row = await createInvitation("a1", "u1", " New@Example.com ", "admin");
		expect(row).toMatchObject({
			accountId: "a1",
			projectId: null,
			email: "new@example.com",
			role: "admin",
			invitedBy: "u1",
			expiresAt: at(NOW + INVITATION_TTL_MS),
			acceptedAt: null,
		});
		expect(typeof row === "object" && row.token).toHaveLength(32);
	});
	test("'member' for someone already in the account (any case), 'full' at the seat cap", async () => {
		expect(await createInvitation("a1", "u1", "ANN@example.com", "member")).toBe("member");
		reset({ account: [a1], ...seats(FREE.members) });
		expect(await createInvitation("a1", "u1", "new@example.com", "member")).toBe("full");
		expect(callsTo("insert", "invitation")).toEqual([]);
	});
	test("to view a project: always role viewer, no seat check (a viewer takes none), 'member' when already on the project, null for another account's project", async () => {
		expect(await createInvitation("a1", "u1", "bob@example.com", "admin", "p1")).toBe("member");
		const row = await createInvitation("a1", "u1", "ann@example.com", "admin", "p1");
		expect(row).toMatchObject({ projectId: "p1", role: "viewer", email: "ann@example.com" });
		expect(await createInvitation("a2", "u1", "ann@example.com", "admin", "p1")).toBeNull();
	});
});

describe("revokeInvitation", () => {
	test("stamps revokedAt on an open invitation of the account; accepted ones and other accounts' are untouched", async () => {
		reset({
			invitation: [
				{ id: "i1", accountId: "a1", acceptedAt: null },
				{ id: "i2", accountId: "a1", acceptedAt: at(1) },
				{ id: "i3", accountId: "a2", acceptedAt: null },
			],
		});
		expect(await revokeInvitation("a1", "i1")).toBe(true);
		expect(fake.rows("invitation")[0].revokedAt).toEqual(at(NOW));
		expect(await revokeInvitation("a1", "i2")).toBe(false);
		expect(await revokeInvitation("a1", "i3")).toBe(false);
	});
});

const openInvitation = {
	id: "i1",
	accountId: "a1",
	projectId: null,
	email: "bob@example.com",
	role: "member",
	token: "t".repeat(32),
	invitedBy: "u1",
	expiresAt: at(NOW + 1000),
	acceptedAt: null,
	revokedAt: null,
};

describe("invitationByToken", () => {
	test("missing, accepted, revoked, expired and open, with the account and project it is for", async () => {
		reset({
			account: [a1],
			project: [{ id: "p1", accountId: "a1", name: "P", slug: "p" }],
			invitation: [
				openInvitation,
				{ ...openInvitation, id: "i2", token: "accepted", acceptedAt: at(1) },
				{ ...openInvitation, id: "i3", token: "revoked", revokedAt: at(1) },
				{ ...openInvitation, id: "i4", token: "expired", expiresAt: at(NOW - 1) },
				{ ...openInvitation, id: "i5", token: "project", projectId: "p1" },
			],
		});
		expect(await invitationByToken("nope")).toEqual({ status: "missing" });
		expect((await invitationByToken("accepted")).status).toBe("accepted");
		expect((await invitationByToken("revoked")).status).toBe("revoked");
		expect((await invitationByToken("expired")).status).toBe("expired");
		const open = await invitationByToken("t".repeat(32));
		expect(open.status).toBe("open");
		if (open.status !== "open") throw new Error("expected open");
		expect(open.invitation.account).toEqual({ id: "a1", name: "Band", slug: "band" });
		expect(open.invitation.project).toBeNull();
		const viewer = await invitationByToken("project");
		if (viewer.status !== "open") throw new Error("expected open");
		expect(viewer.invitation.project).toEqual({ id: "p1", name: "P", slug: "p" });
	});
});

describe("acceptInvitation", () => {
	const bob = { id: "u2", email: "Bob@Example.com" };
	beforeEach(() =>
		reset({
			account: [a1],
			project: [{ id: "p1", accountId: "a1", name: "P", slug: "p" }],
			accountMember: [member("m1", "u1", "owner")],
			invitation: [
				openInvitation,
				{ ...openInvitation, id: "i2", token: "used", acceptedAt: at(1) },
				{ ...openInvitation, id: "i3", token: "old", expiresAt: at(NOW - 1) },
				{ ...openInvitation, id: "i4", token: "project", projectId: "p1", role: "viewer" },
			],
		}),
	);
	test("a used or expired token is refused by its status; a different address is a mismatch", async () => {
		expect(await acceptInvitation("used", bob)).toBe("accepted");
		expect(await acceptInvitation("old", bob)).toBe("expired");
		expect(await acceptInvitation("nope", bob)).toBe("missing");
		expect(await acceptInvitation("t".repeat(32), { id: "u3", email: "eve@example.com" })).toBe(
			"mismatch",
		);
		expect(callsTo("insert", "account_member")).toEqual([]);
	});
	test("joins the account with the invitation's role and closes the invitation", async () => {
		expect(await acceptInvitation("t".repeat(32), bob)).toEqual({
			status: "joined",
			account: { id: "a1", name: "Band", slug: "band" },
			project: null,
			invitedBy: "u1",
		});
		expect(callsTo("insert", "account_member")[0].values).toEqual({
			accountId: "a1",
			userId: "u2",
			role: "member",
		});
		expect(fake.rows("invitation")[0].acceptedAt).toEqual(at(NOW));
	});
	test("someone already a member is not added twice; a full account refuses a newcomer", async () => {
		reset({
			account: [a1],
			accountMember: [member("m1", "u1", "owner"), member("m2", "u2")],
			invitation: [openInvitation],
		});
		expect(await acceptInvitation("t".repeat(32), bob)).toMatchObject({ status: "joined" });
		expect(callsTo("insert", "account_member")).toEqual([]);
		reset({ account: [a1], ...seats(FREE.members), invitation: [openInvitation] });
		expect(await acceptInvitation("t".repeat(32), bob)).toBe("full");
		expect(fake.rows("invitation")[0].acceptedAt).toBeNull();
	});
	test("a project invitation adds a viewer to the project, not the account", async () => {
		expect(await acceptInvitation("project", bob)).toEqual({
			status: "joined",
			account: { id: "a1", name: "Band", slug: "band" },
			project: { id: "p1", name: "P", slug: "p" },
			invitedBy: "u1",
		});
		expect(callsTo("insert", "project_member")[0].values).toEqual({
			projectId: "p1",
			userId: "u2",
			role: "viewer",
			addedBy: "u1",
		});
		expect(callsTo("insert", "account_member")).toEqual([]);
		expect(fake.rows("invitation").find((i) => i.id === "i4")?.acceptedAt).toEqual(at(NOW));
	});
});

const code = (id: string, over: Record<string, unknown> = {}) => ({
	id,
	accountId: "a1",
	code: id.toUpperCase().padEnd(INVITE_CODE_LENGTH, "X"),
	role: "member",
	note: "",
	createdBy: "u1",
	maxUses: null,
	uses: 0,
	expiresAt: null,
	revokedAt: null,
	createdAt: at(NOW),
	...over,
});

describe("createInviteCode", () => {
	test("a 12-character code from the alphabet, expiring in the days asked (0 = never), for an account or the system", async () => {
		const row = await createInviteCode("a1", "u1", {
			role: "admin",
			note: "for Bob",
			maxUses: 3,
			expiresDays: 7,
		});
		expect(row).toMatchObject({
			accountId: "a1",
			role: "admin",
			note: "for Bob",
			maxUses: 3,
			uses: 0,
		});
		expect(row.code).toMatch(new RegExp(`^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`));
		expect(row.expiresAt).toEqual(at(NOW + 7 * 86_400_000));
		const system = await createInviteCode(null, "u1", {
			role: "member",
			note: "",
			maxUses: null,
			expiresDays: 0,
		});
		expect(system).toMatchObject({ accountId: null, expiresAt: null, maxUses: null });
	});
});

describe("listInviteCodes", () => {
	test("the account's codes newest first with their state; null lists the system's", async () => {
		reset({
			user: [u1],
			inviteCode: [
				code("c1", { createdAt: at(1) }),
				code("c2", { createdAt: at(2), revokedAt: at(1) }),
				code("c3", { createdAt: at(3), expiresAt: at(NOW - 1) }),
				code("c4", { createdAt: at(4), maxUses: 2, uses: 2 }),
				code("sys", { accountId: null }),
			],
		});
		expect((await listInviteCodes("a1")).map((c) => [c.id, c.state, c.creator?.name])).toEqual([
			["c4", "used up", "Ann"],
			["c3", "expired", "Ann"],
			["c2", "revoked", "Ann"],
			["c1", "open", "Ann"],
		]);
		expect((await listInviteCodes(null)).map((c) => c.id)).toEqual(["sys"]);
	});
});

describe("revokeInviteCode", () => {
	test("stamps revokedAt within the account's (or the system's) codes", async () => {
		reset({ inviteCode: [code("c1"), code("sys", { accountId: null })] });
		expect(await revokeInviteCode("a2", "c1")).toBe(false);
		expect(await revokeInviteCode("a1", "sys")).toBe(false);
		expect(await revokeInviteCode("a1", "c1")).toBe(true);
		expect(await revokeInviteCode(null, "sys")).toBe(true);
		expect(fake.rows("inviteCode").map((c) => c.revokedAt)).toEqual([at(NOW), at(NOW)]);
	});
});

describe("inviteCodeByCode", () => {
	test("missing or the state, with the account it joins", async () => {
		reset({
			account: [a1],
			inviteCode: [code("c1"), code("c2", { maxUses: 1, uses: 1 })],
		});
		expect(await inviteCodeByCode("NOPE")).toEqual({ status: "missing" });
		const open = await inviteCodeByCode(code("c1").code);
		expect(open.status).toBe("open");
		if (open.status === "missing") throw new Error("expected a code");
		expect(open.code.account).toEqual({ id: "a1", name: "Band", slug: "band" });
		expect((await inviteCodeByCode(code("c2").code)).status).toBe("used up");
	});
});

describe("redeemInviteCode", () => {
	beforeEach(() =>
		reset({
			account: [a1],
			accountMember: [member("m1", "u1", "owner")],
			inviteCode: [
				code("c1", { role: "admin", maxUses: 2, uses: 1 }),
				code("sys", { accountId: null }),
			],
		}),
	);
	test("joins the account with the code's role and counts the use; the last use closes the code", async () => {
		expect(await redeemInviteCode(code("c1").code, "u2")).toEqual({
			status: "joined",
			account: { id: "a1", name: "Band", slug: "band" },
		});
		expect(callsTo("insert", "account_member")[0].values).toEqual({
			accountId: "a1",
			userId: "u2",
			role: "admin",
		});
		expect(fake.rows("inviteCode")[0].uses).toBe(2);
		expect(await redeemInviteCode(code("c1").code, "u3")).toBe("used up");
		expect(callsTo("insert", "account_member")).toHaveLength(1);
	});
	test("a member already counts a use without a second membership; a system code only counts", async () => {
		expect(await redeemInviteCode(code("c1").code, "u1")).toMatchObject({ status: "joined" });
		expect(callsTo("insert", "account_member")).toEqual([]);
		expect(await redeemInviteCode(code("sys").code, "u2")).toEqual({
			status: "joined",
			account: null,
		});
		expect(fake.rows("inviteCode").map((c) => c.uses)).toEqual([2, 1]);
	});
	test("a full account refuses the newcomer before counting", async () => {
		reset({ account: [a1], ...seats(FREE.members), inviteCode: [code("c1")] });
		expect(await redeemInviteCode(code("c1").code, "u2")).toBe("full");
		expect(fake.rows("inviteCode")[0].uses).toBe(0);
	});
});
