import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

// data.ts reaches the database and Blob; both are stubbed. `presentUrl`
// signs visibly, so a test can tell a presented URL from a raw one.
const { fake, blob } = await vi.hoisted(async () => ({
	fake: (await import("../../../tests/helpers/fakeDb")).fakeDb(),
	blob: {
		presentUrl: vi.fn(async (url: string | null | undefined) => (url ? `signed:${url}` : null)),
		deleteBlobs: vi.fn(async () => {}),
		recordingAccess: vi.fn(() => "private" as const),
	},
}));
vi.mock("$lib/server/db", async () => ({
	db: fake,
	schema: await import("$lib/server/db/schema"),
}));
vi.mock("$lib/server/blob", () => blob);

const {
	accountDefaultArtist,
	addArtistMember,
	addSongCredit,
	deleteArtist,
	listArtistsWithCounts,
	manifestFor,
	memberEmails,
	presentSongFiles,
	projectViewRow,
	removeArtistMember,
	removeSongCredit,
	setAccountDefaultArtist,
	songViewRow,
	updateAccount,
	updateArtist,
} = await import("./data");

type StemRow = Parameters<typeof manifestFor>[0]["stems"][number];
const stemOf = (id: string, extra: Partial<StemRow> = {}) =>
	({
		id,
		label: id,
		status: "ready",
		url: `https://b/${id}.wav`,
		playbackStatus: null,
		playbackUrl: null,
		durationSeconds: null,
		channels: null,
		peaks: null,
		gain: 1,
		...extra,
	}) as StemRow;

const artistOf = (
	id: string,
	accountId: string,
	name: string,
	extra: Record<string, unknown> = {},
) => ({
	id,
	accountId,
	name,
	kind: "group",
	email: "",
	sortName: "",
	website: "",
	note: "",
	imageUrl: null,
	...extra,
});
const credit = (id: string, songId: string, artistId: string, role: string) => ({
	id,
	songId,
	artistId,
	role,
	sortOrder: 1,
});
const fixtures = {
	account: [
		{ id: "a1", name: "Acme", slug: "acme", defaultArtistId: null },
		{ id: "a2", name: "Beta", slug: "beta", defaultArtistId: "ar2" },
	],
	user: [
		{ id: "u1", name: "Kev", email: "Kev@Example.com" },
		{ id: "u2", name: "Bo", email: "b@x.com" },
		{ id: "u3", name: "Cy", email: "c@x.com" },
	],
	accountMember: [
		{ id: "am1", accountId: "a1", userId: "u1", role: "owner" },
		{ id: "am2", accountId: "a1", userId: "u2", role: "member" },
		{ id: "am3", accountId: "a2", userId: "u3", role: "owner" },
	],
	project: [
		{
			id: "p1",
			accountId: "a1",
			name: "Proj",
			status: "active",
			isPrivate: false,
			isRestricted: true,
		},
		{
			id: "p2",
			accountId: "a1",
			name: "Old",
			status: "archived",
			isPrivate: false,
			isRestricted: false,
		},
	],
	song: [
		{ id: "s1", accountId: "a1", projectId: "p1", title: "One", isPrivate: false },
		{ id: "s2", accountId: "a1", projectId: "p1", title: "Two", isPrivate: true },
		{ id: "s3", accountId: "a2", projectId: "p9", title: "Theirs", isPrivate: false },
	],
	artist: [
		artistOf("ar1", "a1", "The Band", { sortName: "Band, The" }),
		artistOf("ar2", "a2", "Other"),
		artistOf("ar3", "a1", "Alpha"),
		artistOf("ar4", "a1", "Zed", { imageUrl: "https://blob/zed.png" }),
	],
	artistMember: [
		{ id: "m1", artistId: "ar1", name: "Dee", role: "drums", email: "", sortOrder: 1 },
		{ id: "m2", artistId: "ar1", name: "Bea", role: "bass", email: "", sortOrder: 2 },
		{ id: "m3", artistId: "ar2", name: "Cy", role: "", email: "", sortOrder: 1 },
	],
	songCredit: [
		credit("c1", "s1", "ar1", "performer"),
		credit("c2", "s1", "ar1", "composer"),
		credit("c3", "s2", "ar1", "performer"),
		credit("c4", "s3", "ar2", "performer"),
	],
};
const ops = (op: string, table: string) =>
	fake.calls.filter((c) => c.op === op && c.table === table);
const ids = (rows: { id?: unknown }[]) => rows.map((r) => r.id);
const accountRow = (id: string) => fake.rows("account").find((r) => r.id === id)!;

beforeEach(() => {
	fake.reset(fixtures);
	blob.deleteBlobs.mockClear();
	blob.presentUrl.mockClear();
});

describe("manifestFor", () => {
	it("ready stems only, the rendition when it is ready and the source until then, each presented", async () => {
		expect(
			await manifestFor({
				title: "T",
				stems: [
					stemOf("a", {
						playbackStatus: "ready",
						playbackUrl: "https://b/a.m4a",
						durationSeconds: 3.5,
						channels: 2,
						peaks: [0, 1],
						gain: 0.5,
					}),
					stemOf("b", { playbackStatus: "pending", playbackUrl: "https://b/b.m4a" }),
					stemOf("c", { playbackStatus: "ready", playbackUrl: null }),
					stemOf("d", { status: "uploading" }),
					stemOf("e", { url: "" }),
				],
			}),
		).toEqual({
			title: "T",
			stems: [
				{
					id: "a",
					label: "a",
					url: "signed:https://b/a.m4a",
					duration: 3.5,
					channels: 2,
					peaks: [0, 1],
					gain: 0.5,
				},
				{ id: "b", label: "b", url: "signed:https://b/b.wav", gain: 1 },
				{ id: "c", label: "c", url: "signed:https://b/c.wav", gain: 1 },
			],
		});
	});
});

describe("presentSongFiles", () => {
	it("every file URL through presentUrl, a null one staying null, the rest of the song as it was", async () => {
		expect(
			await presentSongFiles({
				id: "s1",
				mixUrl: "https://b/mix.m4a",
				stems: [{ url: "https://b/s.wav", playbackUrl: null, midiUrl: "https://b/s.mid" }],
				demos: [{ url: "https://b/d.mp3", playbackUrl: "https://b/d.m4a" }],
				files: [{ url: "https://b/f.pdf", thumbnailUrl: null }],
				notation: [{ url: "https://b/n.xml", thumbnailUrl: "https://b/n.png" }],
			}),
		).toEqual({
			id: "s1",
			mixUrl: "signed:https://b/mix.m4a",
			stems: [
				{ url: "signed:https://b/s.wav", playbackUrl: null, midiUrl: "signed:https://b/s.mid" },
			],
			demos: [{ url: "signed:https://b/d.mp3", playbackUrl: "signed:https://b/d.m4a" }],
			files: [{ url: "signed:https://b/f.pdf", thumbnailUrl: null }],
			notation: [{ url: "signed:https://b/n.xml", thumbnailUrl: "signed:https://b/n.png" }],
		});
	});
	it("no mix stays no mix", async () => {
		const s = await presentSongFiles({
			mixUrl: null,
			stems: [],
			demos: [],
			files: [],
			notation: [],
		});
		expect(s.mixUrl).toBeNull();
	});
});

describe("projectViewRow / songViewRow", () => {
	it("an active project's view columns, unscoped; null when archived or missing", async () => {
		expect(await projectViewRow("p1")).toEqual({
			id: "p1",
			accountId: "a1",
			name: "Proj",
			isPrivate: false,
			isRestricted: true,
		});
		expect(await projectViewRow("p2")).toBeNull();
		expect(await projectViewRow("nope")).toBeNull();
	});
	it("a song's view columns with its project's; null when missing", async () => {
		expect(await songViewRow("s2")).toEqual({
			id: "s2",
			accountId: "a1",
			projectId: "p1",
			isPrivate: true,
			project: { isPrivate: false, isRestricted: true },
		});
		expect(await songViewRow("nope")).toBeNull();
	});
});

describe("listArtistsWithCounts", () => {
	it("the account's artists by sort name then name, with distinct songs and people counted", async () => {
		expect(
			(await listArtistsWithCounts("a1")).map((a) => [a.id, a.name, a.songCount, a.memberCount]),
		).toEqual([
			["ar3", "Alpha", 0, 0],
			["ar4", "Zed", 0, 0],
			["ar1", "The Band", 2, 2],
		]);
	});
});

describe("updateArtist", () => {
	const input = { kind: "group" as const, email: "", sortName: "", website: "", note: "" };
	it("false when another artist of the account has the name, whatever the case", async () => {
		expect(await updateArtist("a1", "ar3", { ...input, name: "the band" })).toBe(false);
		expect(ops("update", "artist")).toEqual([]);
	});
	it("the artist's own name in a new case is fine; the email is lowercased", async () => {
		expect(
			await updateArtist("a1", "ar1", { ...input, name: "THE BAND", email: "Kev@X.com" }),
		).toBe(true);
		expect(fake.rows("artist")[0]).toMatchObject({ name: "THE BAND", email: "kev@x.com" });
	});
	it("false for another account's artist", async () => {
		expect(await updateArtist("a1", "ar2", { ...input, name: "Mine now" })).toBe(false);
		expect(fake.rows("artist")[1].name).toBe("Other");
	});
});

describe("deleteArtist", () => {
	it("false for another account's artist", async () => {
		expect(await deleteArtist("a1", "ar2")).toBe(false);
		expect(fake.rows("artist")).toHaveLength(4);
	});
	it("removes the artist, its people, its credits and its picture", async () => {
		expect(await deleteArtist("a1", "ar4")).toBe(true);
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://blob/zed.png"]);
		expect(await deleteArtist("a1", "ar1")).toBe(true);
		expect(ids(fake.rows("artist"))).toEqual(["ar2", "ar3"]);
		expect(ids(fake.rows("artistMember"))).toEqual(["m3"]);
		expect(ids(fake.rows("songCredit"))).toEqual(["c4"]);
		expect(blob.deleteBlobs).toHaveBeenCalledTimes(1);
	});
	it("clears the account's default artist when it was this one", async () => {
		accountRow("a1").defaultArtistId = "ar1";
		await deleteArtist("a1", "ar3");
		expect(accountRow("a1").defaultArtistId).toBe("ar1");
		await deleteArtist("a1", "ar1");
		expect(accountRow("a1").defaultArtistId).toBeNull();
	});
});

describe("addArtistMember / removeArtistMember", () => {
	it("null for another account's artist", async () => {
		expect(await addArtistMember("a1", "ar2", { name: "X", role: "", email: "" })).toBeNull();
		expect(ops("insert", "artist_member")).toEqual([]);
	});
	it("joins after the last person, the email lowercased", async () => {
		expect(
			await addArtistMember("a1", "ar1", { name: "Lee", role: "keys", email: "Lee@X.com" }),
		).toMatchObject({
			artistId: "ar1",
			name: "Lee",
			role: "keys",
			email: "lee@x.com",
			sortOrder: 3,
		});
		expect(await addArtistMember("a1", "ar3", { name: "Solo", role: "", email: "" })).toMatchObject(
			{
				sortOrder: 1,
			},
		);
	});
	it("removes the account's own person only", async () => {
		expect(await removeArtistMember("a1", "m3")).toBe(false);
		expect(await removeArtistMember("a1", "m1")).toBe(true);
		expect(ids(fake.rows("artistMember"))).toEqual(["m2", "m3"]);
	});
});

describe("memberEmails", () => {
	it("the account's members' emails, lowercased", async () => {
		expect(await memberEmails("a1")).toEqual(new Set(["kev@example.com", "b@x.com"]));
		expect(await memberEmails("zz")).toEqual(new Set());
	});
});

describe("accountDefaultArtist / setAccountDefaultArtist", () => {
	it("the default artist's id, or null", async () => {
		expect(await accountDefaultArtist("a1")).toBeNull();
		expect(await accountDefaultArtist("a2")).toBe("ar2");
		expect(await accountDefaultArtist("zz")).toBeNull();
	});
	it("false for an artist that is not the account's, with nothing written", async () => {
		expect(await setAccountDefaultArtist("a1", "ar2")).toBe(false);
		expect(ops("update", "account")).toEqual([]);
	});
	it("sets and clears", async () => {
		expect(await setAccountDefaultArtist("a1", "ar1")).toBe(true);
		expect(accountRow("a1").defaultArtistId).toBe("ar1");
		expect(await setAccountDefaultArtist("a1", null)).toBe(true);
		expect(accountRow("a1").defaultArtistId).toBeNull();
	});
});

describe("addSongCredit", () => {
	it("null for another account's song", async () => {
		expect(await addSongCredit("a2", "s1", "performer", "X")).toBeNull();
		expect(ops("insert", "song_credit")).toEqual([]);
	});
	it("reuses the account's artist by name, whatever the case, after the role's last credit", async () => {
		expect(await addSongCredit("a1", "s1", "performer", "the band")).toEqual({
			id: "ar1",
			name: "The Band",
		});
		expect(ops("insert", "artist")).toEqual([]);
		expect(ops("insert", "song_credit")[0].values).toEqual({
			songId: "s1",
			artistId: "ar1",
			role: "performer",
			sortOrder: 2,
		});
	});
	it("makes a new artist in the account for a new name", async () => {
		const who = await addSongCredit("a1", "s2", "composer", "Newbie");
		expect(who?.name).toBe("Newbie");
		expect(fake.rows("artist").at(-1)).toMatchObject({
			id: who?.id,
			accountId: "a1",
			name: "Newbie",
		});
		expect(ops("insert", "song_credit")[0].values).toEqual({
			songId: "s2",
			artistId: who?.id,
			role: "composer",
			sortOrder: 1,
		});
	});
});

describe("removeSongCredit", () => {
	it("removes the account's own credit only", async () => {
		expect(await removeSongCredit("a1", "c4")).toBe(false);
		expect(await removeSongCredit("a1", "c1")).toBe(true);
		expect(ids(fake.rows("songCredit"))).toEqual(["c2", "c3", "c4"]);
	});
});

describe("updateAccount", () => {
	it("needs a name and a well-formed slug", async () => {
		expect(await updateAccount("a1", { name: "  ", slug: "acme" })).toEqual({
			ok: false,
			field: "name",
			error: "Give the account a name.",
		});
		expect(await updateAccount("a1", { name: "Acme", slug: "Bad Slug!" })).toEqual({
			ok: false,
			field: "slug",
			error: "Lowercase letters, digits and single hyphens only.",
		});
	});
	it("refuses another account's slug, live or reserved", async () => {
		fake.reset({
			...fixtures,
			slugAlias: [{ id: "al1", kind: "account", scopeId: "", slug: "old-beta", targetId: "a2" }],
		});
		expect(await updateAccount("a1", { name: "Acme", slug: "beta" })).toMatchObject({
			ok: false,
			field: "slug",
			error: 'Another account already uses "beta".',
		});
		expect(await updateAccount("a1", { name: "Acme", slug: "old-beta" })).toMatchObject({
			ok: false,
			field: "slug",
			error: '"old-beta" belonged to another account and is reserved.',
		});
		expect(ops("update", "account")).toEqual([]);
	});
	it("renames and moves the slug, the old address redirecting from now on (an own old slug may be taken back)", async () => {
		fake.reset({
			...fixtures,
			slugAlias: [{ id: "al1", kind: "account", scopeId: "", slug: "old-acme", targetId: "a1" }],
		});
		const r = await updateAccount("a1", { name: " Acme Inc ", slug: "Old-Acme" });
		expect(r.ok && r.account).toMatchObject({ id: "a1", name: "Acme Inc", slug: "old-acme" });
		expect(fake.rows("slugAlias").map((a) => [a.slug, a.targetId])).toEqual([["acme", "a1"]]);
	});
	it("the same slug records no alias; an unknown account is an error", async () => {
		expect(await updateAccount("a1", { name: "Renamed", slug: "acme" })).toMatchObject({
			ok: true,
		});
		expect(ops("insert", "slug_alias")).toEqual([]);
		expect(await updateAccount("zz", { name: "Ghost", slug: "ghost" })).toEqual({
			ok: false,
			field: "name",
			error: "Account not found.",
		});
	});
});
