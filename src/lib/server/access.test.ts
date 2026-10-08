import { isHttpError, isRedirect } from "@sveltejs/kit";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

// access.ts reaches the database through the fake, and data.ts (whose
// lookups have tests of their own) through spies. vi.mock factories are
// hoisted above imports, so everything they need is hoisted too.
const { fake, data, event, ran } = await vi.hoisted(async () => ({
	fake: (await import("../../../tests/helpers/fakeDb")).fakeDb(),
	data: {
		logAudit: vi.fn(),
		openShareLinks: vi.fn(),
		projectRestricted: vi.fn(),
		projectRoleOf: vi.fn(),
		projectRolesOf: vi.fn(),
		songViewRow: vi.fn(),
		userOwnsIdea: vi.fn(),
	},
	event: {
		request: new Request("https://x.test/acct/proj/song", { method: "POST" }),
		url: new URL("https://x.test/acct/proj/song"),
		cookies: { get: () => undefined },
	},
	ran: [] as Promise<void>[],
}));
vi.mock("#lib/server/db/index.js", async () => ({
	db: fake,
	schema: await import("#lib/server/db/schema/index.js"),
}));
vi.mock("#lib/server/data.js", () => data);
vi.mock("#lib/server/blob.js", () => ({
	isRecordingPathname: (pathname: string) => pathname.includes("/recordings/"),
}));
vi.mock("#lib/server/background.js", () => ({
	background: (work: () => Promise<void>) => {
		ran.push(work());
	},
}));
vi.mock("$app/server", () => ({ getRequestEvent: () => event }));

const access = await import("./access");

const user = {
	id: "u1",
	name: "Uma",
	email: "uma@x.test",
	isSystemAdmin: false,
	isSuperAdmin: false,
	twoFactorEnabled: false,
};
type Membership = App.Locals["memberships"][number];
const membership = (role: string, extra: Partial<Membership> = {}): Membership => ({
	accountId: "a1",
	slug: "acct",
	name: "Acct",
	role,
	...extra,
});
/** A signed-in person with one membership of `role` in a1, or none. */
const locals = (role: string | null, extra: Partial<Membership> = {}): App.Locals => ({
	user,
	memberships: role ? [membership(role, extra)] : [],
});
const signedOut: App.Locals = { user: null, memberships: [] };

/** The status an access helper throws, or null when it does not throw (redirects count). */
async function statusOf(run: () => unknown): Promise<number | null> {
	try {
		await run();
	} catch (e) {
		if (isHttpError(e) || isRedirect(e)) return e.status;
		throw e;
	}
	return null;
}

const ROLES = ["owner", "admin", "member", "viewer", null] as const;

beforeEach(() => {
	fake.reset();
	ran.length = 0;
	for (const fn of Object.values(data)) fn.mockReset();
	data.projectRestricted.mockResolvedValue(false);
	data.projectRoleOf.mockResolvedValue(null);
	data.projectRolesOf.mockResolvedValue({});
	data.openShareLinks.mockResolvedValue([]);
	data.logAudit.mockResolvedValue(undefined);
});

describe("role predicates", () => {
	test("isEditor: every role but viewer", () => {
		expect(ROLES.filter((r) => r !== null).map((r) => [r, access.isEditor(r)])).toEqual([
			["owner", true],
			["admin", true],
			["member", true],
			["viewer", false],
		]);
	});
	test("canEdit and isMember by role; a membership of another account counts for nothing", () => {
		expect(
			ROLES.map((r) => [r, access.canEdit(locals(r), "a1"), access.isMember(locals(r), "a1")]),
		).toEqual([
			["owner", true, true],
			["admin", true, true],
			["member", true, true],
			["viewer", false, true],
			[null, false, false],
		]);
		const elsewhere = locals("owner", { accountId: "a2" });
		expect(access.canEdit(elsewhere, "a1")).toBe(false);
		expect(access.isMember(elsewhere, "a1")).toBe(false);
		expect(access.canEdit(signedOut, "a1")).toBe(false);
	});
	test("viewerOf carries the account role (null for outsiders) and the project roles given", () => {
		expect(access.viewerOf(locals("viewer"), "a1", { p1: "member" })).toEqual({
			accountRole: "viewer",
			projectRoles: { p1: "member" },
		});
		expect(access.viewerOf(locals("owner"), "a2", {})).toEqual({
			accountRole: null,
			projectRoles: {},
		});
		expect(access.viewerOf(signedOut, "a1", {})).toEqual({ accountRole: null, projectRoles: {} });
	});
});

describe("require* on locals", () => {
	test("requireUser: 401 signed out, the user otherwise", async () => {
		expect(await statusOf(() => access.requireUser(signedOut))).toBe(401);
		expect(access.requireUser(locals(null))).toBe(user);
	});
	test("requireSignedIn: a 303 to sign-in carrying the page, the user otherwise", async () => {
		const url = new URL("https://x.test/acct/settings?tab=people");
		try {
			access.requireSignedIn(signedOut, url);
			expect.unreachable();
		} catch (e) {
			if (!isRedirect(e)) throw e;
			expect(e.status).toBe(303);
			expect(e.location).toBe("/sign-in?next=%2Facct%2Fsettings");
		}
		expect(access.requireSignedIn(locals(null), url)).toBe(user);
	});
	test("requireSystemAdmin and requireSuperAdmin: 404 for everyone else, signed out included", async () => {
		expect(await statusOf(() => access.requireSystemAdmin(signedOut))).toBe(404);
		expect(await statusOf(() => access.requireSystemAdmin(locals("owner")))).toBe(404);
		expect(await statusOf(() => access.requireSuperAdmin(locals("owner")))).toBe(404);
		const sys = { ...locals(null), user: { ...user, isSystemAdmin: true } };
		expect(access.requireSystemAdmin(sys)).toBe(sys.user);
		expect(await statusOf(() => access.requireSuperAdmin(sys))).toBe(404);
		const sup = { ...locals(null), user: { ...user, isSuperAdmin: true } };
		expect(access.requireSuperAdmin(sup)).toBe(sup.user);
	});
	test("requireMember: any role passes, an outsider is a 404, signed out a 401", async () => {
		for (const role of ["owner", "admin", "member", "viewer"])
			expect(access.requireMember(locals(role), "a1")).toEqual(membership(role));
		expect(await statusOf(() => access.requireMember(locals(null), "a1"))).toBe(404);
		expect(await statusOf(() => access.requireMember(locals("owner"), "a2"))).toBe(404);
		expect(await statusOf(() => access.requireMember(signedOut, "a1"))).toBe(401);
	});
	test("requireEditor: viewers get the 404 a non-member gets", async () => {
		for (const role of ["owner", "admin", "member"])
			expect(access.requireEditor(locals(role), "a1")).toEqual(membership(role));
		expect(await statusOf(() => access.requireEditor(locals("viewer"), "a1"))).toBe(404);
		expect(await statusOf(() => access.requireEditor(locals(null), "a1"))).toBe(404);
	});
	test("a super admin acting as an owner is audited with the request, after the response", async () => {
		access.requireMember(locals("owner", { actingAs: true }), "a1");
		await Promise.all(ran);
		expect(data.logAudit).toHaveBeenCalledWith({
			userId: "u1",
			accountId: "a1",
			action: "POST /acct/proj/song",
		});
		access.requireMember(locals("owner"), "a1");
		await Promise.all(ran);
		expect(data.logAudit).toHaveBeenCalledTimes(1);
	});
});

describe("publicAccountBySlug", () => {
	test("answers the public columns of the account, or a 404 naming the slug", async () => {
		fake.reset({
			account: [
				{
					id: "a1",
					name: "Acct",
					slug: "acct",
					status: "active",
					plan: "free",
					lifetimeFree: false,
					isFounder: false,
					imageUrl: null,
					secret: "not listed",
				},
			],
		});
		expect(await access.publicAccountBySlug("acct")).toEqual({
			id: "a1",
			name: "Acct",
			slug: "acct",
			status: "active",
			plan: "free",
			lifetimeFree: false,
			isFounder: false,
			imageUrl: null,
		});
		expect(await statusOf(() => access.publicAccountBySlug("nope"))).toBe(404);
	});
});

describe("accountOf* lookups", () => {
	beforeEach(() =>
		fake.reset({
			project: [{ id: "p1", accountId: "a1" }],
			song: [{ id: "s1", accountId: "a1", projectId: "p1" }],
			stem: [{ id: "st1", accountId: "a1", songId: "s1" }],
			demo: [{ id: "d1", accountId: "a1", songId: "s1" }],
			idea: [{ id: "i1", accountId: "a1" }],
			recording: [{ id: "r1", accountId: "a1" }],
			artist: [{ id: "ar1", accountId: "a1" }],
			artistMember: [
				{ id: "am1", artistId: "ar1" },
				{ id: "am9", artistId: "nope" },
			],
			songCredit: [{ id: "cr1", songId: "s1" }],
			songFile: [{ id: "f1", accountId: "a1" }],
			songNotation: [{ id: "n1", accountId: "a1" }],
			beat: [{ id: "b1", accountId: "a1" }],
			progression: [{ id: "pr1", accountId: "a1" }],
			chordStyle: [{ id: "cs1", accountId: "a1" }],
			pianoPreset: [{ id: "pp1", accountId: "a1" }],
		}),
	);
	test("each answers its row's account, and null for an id nobody has", async () => {
		const lookups: [(id: string) => Promise<string | null>, string][] = [
			[access.accountOfProject, "p1"],
			[access.accountOfSong, "s1"],
			[access.accountOfStem, "st1"],
			[access.accountOfDemo, "d1"],
			[access.accountOfIdea, "i1"],
			[access.accountOfRecording, "r1"],
			[access.accountOfArtist, "ar1"],
			[access.accountOfFile, "f1"],
			[access.accountOfNotation, "n1"],
			[access.accountOfBeat, "b1"],
			[access.accountOfProgression, "pr1"],
			[access.accountOfChordStyle, "cs1"],
			[access.accountOfPianoPreset, "pp1"],
		];
		for (const [lookup, id] of lookups) {
			expect(await lookup(id)).toBe("a1");
			expect(await lookup("nope")).toBeNull();
		}
	});
	test("a credit and an artist member answer through their parent", async () => {
		expect(await access.accountOfCredit("cr1")).toBe("a1");
		expect(await access.accountOfCredit("nope")).toBeNull();
		expect(await access.accountOfArtistMember("am1")).toBe("a1");
		expect(await access.accountOfArtistMember("nope")).toBeNull();
		// A member whose artist row is gone (foreign keys are off) is "not found", not a 500.
		expect(await access.accountOfArtistMember("am9")).toBeNull();
	});
});

describe("accountOfUploadPathname", () => {
	beforeEach(() =>
		fake.reset({
			stem: [
				{
					id: "st1",
					accountId: "a1",
					pathname: "accounts/a1/songs/s1/st1.wav",
					midiPathname: "accounts/a1/songs/s1/st1.mid",
				},
			],
			recording: [{ id: "r1", accountId: "a2", pathname: "accounts/a2/recordings/r1.wav" }],
			recordingStem: [
				{ id: "rs1", accountId: "a3", pathname: "accounts/a3/recordings/r2/rs1.wav" },
			],
			demo: [{ id: "d1", accountId: "a4", pathname: "accounts/a4/songs/s4/d1.mp3" }],
			songFile: [{ id: "f1", accountId: "a5", pathname: "accounts/a5/projects/p5/files/f1.pdf" }],
			songNotation: [
				{ id: "n1", accountId: "a6", pathname: "accounts/a6/songs/s6/notation/n1.xml" },
			],
		}),
	);
	test("a stem, its MIDI file, a take, a take's stem, a demo, an attachment and a notation file each find their owner", async () => {
		expect(await access.accountOfUploadPathname("accounts/a1/songs/s1/st1.wav")).toBe("a1");
		expect(await access.accountOfUploadPathname("accounts/a1/songs/s1/st1.mid")).toBe("a1");
		expect(await access.accountOfUploadPathname("accounts/a2/recordings/r1.wav")).toBe("a2");
		expect(await access.accountOfUploadPathname("accounts/a3/recordings/r2/rs1.wav")).toBe("a3");
		expect(await access.accountOfUploadPathname("accounts/a4/songs/s4/d1.mp3")).toBe("a4");
		expect(await access.accountOfUploadPathname("accounts/a5/projects/p5/files/f1.pdf")).toBe("a5");
		expect(await access.accountOfUploadPathname("accounts/a6/songs/s6/notation/n1.xml")).toBe("a6");
	});
	test("a pathname nobody reserved is null, and a recordings path never consults the song tables", async () => {
		expect(await access.accountOfUploadPathname("accounts/a1/songs/s1/other.wav")).toBeNull();
		fake.calls.length = 0;
		expect(await access.accountOfUploadPathname("accounts/a9/recordings/none.wav")).toBeNull();
		expect(fake.calls.map((c) => c.table)).toEqual(["stem", "recording", "recording_stem"]);
	});
});

describe("requireOwnIdea", () => {
	beforeEach(() => fake.reset({ idea: [{ id: "i1", accountId: "a1", createdBy: "u1" }] }));
	test("401 signed out before any lookup; 404 for an idea that is not theirs or not at all", async () => {
		expect(await statusOf(() => access.requireOwnIdea(signedOut, "i1"))).toBe(401);
		expect(fake.calls).toEqual([]);
		expect(await statusOf(() => access.requireOwnIdea(locals(null), "nope"))).toBe(404);
		expect(data.userOwnsIdea).not.toHaveBeenCalled();
		data.userOwnsIdea.mockResolvedValue(false);
		expect(await statusOf(() => access.requireOwnIdea(locals("owner"), "i1"))).toBe(404);
		expect(data.userOwnsIdea).toHaveBeenCalledWith("a1", "u1", "i1");
	});
	test("creatorship, not membership, is the gate: an outsider who made it passes", async () => {
		data.userOwnsIdea.mockResolvedValue(true);
		expect(await access.requireOwnIdea(locals(null), "i1")).toEqual({
			accountId: "a1",
			userId: "u1",
		});
	});
});

describe("memberOf", () => {
	beforeEach(() =>
		fake.reset({
			account: [{ id: "a1", slug: "acct", name: "Acct" }],
			project: [{ id: "p1", accountId: "a1" }],
			song: [{ id: "s1", accountId: "a1", projectId: "p1" }],
			stem: [{ id: "st1", accountId: "a1", songId: "s1" }],
			idea: [{ id: "i1", accountId: "a1" }],
		}),
	);
	test("an id nobody has is a 404 before any membership is looked at", async () => {
		expect(
			await statusOf(() => access.memberOf(locals("owner"), access.accountOfSong, "nope")),
		).toBe(404);
		expect(data.projectRestricted).not.toHaveBeenCalled();
	});
	test("owners and admins pass without the project being checked; acting owners are audited", async () => {
		for (const role of ["owner", "admin"])
			expect(await access.memberOf(locals(role), access.accountOfSong, "s1")).toEqual(
				membership(role),
			);
		expect(data.projectRestricted).not.toHaveBeenCalled();
		expect(data.projectRoleOf).not.toHaveBeenCalled();
		await access.memberOf(locals("owner", { actingAs: true }), access.accountOfSong, "s1");
		await Promise.all(ran);
		expect(data.logAudit).toHaveBeenCalledTimes(1);
	});
	test("on an open project a member edits, a viewer only passes with `viewers`", async () => {
		expect(await access.memberOf(locals("member"), access.accountOfSong, "s1")).toEqual(
			membership("member"),
		);
		expect(data.projectRestricted).toHaveBeenCalledWith("p1");
		expect(
			await statusOf(() => access.memberOf(locals("viewer"), access.accountOfSong, "s1")),
		).toBe(404);
		expect(
			await access.memberOf(locals("viewer"), access.accountOfSong, "s1", { viewers: true }),
		).toEqual(membership("viewer"));
	});
	test("a restricted project admits a member only when added to it; added as a viewer counts with `viewers`", async () => {
		data.projectRestricted.mockResolvedValue(true);
		expect(
			await statusOf(() => access.memberOf(locals("member"), access.accountOfSong, "s1")),
		).toBe(404);
		data.projectRoleOf.mockResolvedValue("member");
		expect(await access.memberOf(locals("member"), access.accountOfSong, "s1")).toEqual(
			membership("member"),
		);
		expect(data.projectRoleOf).toHaveBeenCalledWith("p1", "u1");
		data.projectRoleOf.mockResolvedValue("viewer");
		expect(
			await statusOf(() => access.memberOf(locals("member"), access.accountOfSong, "s1")),
		).toBe(404);
		expect(
			await access.memberOf(locals("member"), access.accountOfSong, "s1", { viewers: true }),
		).toEqual(membership("member"));
	});
	test("the project is found through a stem's song; an entity without one skips the restriction", async () => {
		data.projectRestricted.mockResolvedValue(true);
		expect(
			await statusOf(() => access.memberOf(locals("member"), access.accountOfStem, "st1")),
		).toBe(404);
		expect(data.projectRestricted).toHaveBeenCalledWith("p1");
		data.projectRestricted.mockClear();
		expect(await access.memberOf(locals("member"), access.accountOfIdea, "i1")).toEqual(
			membership("member"),
		);
		expect(data.projectRestricted).not.toHaveBeenCalled();
	});
	test("an outsider added to the project as a viewer passes with `viewers` as a viewer of the account, never as an editor", async () => {
		data.projectRoleOf.mockResolvedValue("viewer");
		expect(
			await access.memberOf(locals(null), access.accountOfSong, "s1", { viewers: true }),
		).toEqual({
			accountId: "a1",
			slug: "acct",
			name: "Acct",
			role: "viewer",
		});
		expect(await statusOf(() => access.memberOf(locals(null), access.accountOfSong, "s1"))).toBe(
			404,
		);
		data.projectRoleOf.mockResolvedValue(null);
		expect(
			await statusOf(() =>
				access.memberOf(locals(null), access.accountOfSong, "s1", { viewers: true }),
			),
		).toBe(404);
		expect(
			await statusOf(() =>
				access.memberOf(signedOut, access.accountOfSong, "s1", { viewers: true }),
			),
		).toBe(401);
	});
});

describe("songViewerOf", () => {
	const row = {
		id: "s1",
		accountId: "a1",
		projectId: "p1",
		isPrivate: true,
		project: { isPrivate: false, isRestricted: false },
	};
	test("401 signed out, 404 for a song that is not there or not theirs to see", async () => {
		expect(await statusOf(() => access.songViewerOf(signedOut, "s1"))).toBe(401);
		expect(data.songViewRow).not.toHaveBeenCalled();
		data.songViewRow.mockResolvedValue(null);
		expect(await statusOf(() => access.songViewerOf(locals("owner"), "nope"))).toBe(404);
		data.songViewRow.mockResolvedValue(row);
		expect(await statusOf(() => access.songViewerOf(locals(null), "s1"))).toBe(404);
	});
	test("a member, a project viewer or a share code the visitor carries opens a private song", async () => {
		data.songViewRow.mockResolvedValue(row);
		expect(await access.songViewerOf(locals("viewer"), "s1")).toEqual({
			accountId: "a1",
			userId: "u1",
		});
		data.projectRolesOf.mockResolvedValue({ p1: "viewer" });
		expect(await access.songViewerOf(locals(null), "s1")).toEqual({
			accountId: "a1",
			userId: "u1",
		});
		expect(data.projectRolesOf).toHaveBeenCalledWith("a1", "u1");
		data.projectRolesOf.mockResolvedValue({});
		data.openShareLinks.mockResolvedValue([{ code: "C1", projectId: null, songId: "s1" }]);
		expect(await access.songViewerOf(locals(null), "s1")).toEqual({
			accountId: "a1",
			userId: "u1",
		});
	});
	test("an acting owner is audited here too", async () => {
		data.songViewRow.mockResolvedValue(row);
		await access.songViewerOf(locals("owner", { actingAs: true }), "s1");
		await Promise.all(ran);
		expect(data.logAudit).toHaveBeenCalledWith(
			expect.objectContaining({ userId: "u1", accountId: "a1" }),
		);
	});
});
