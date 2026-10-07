import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

// data.ts reaches the database and Blob; both are stubbed (nothing here touches Blob).
const { fake, blob } = await vi.hoisted(async () => ({
	fake: (await import("../../../tests/helpers/fakeDb")).fakeDb(),
	blob: {
		presentUrl: vi.fn(async (url: string | null | undefined) => url ?? null),
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
	claimPlayback,
	claimSongMix,
	failPlayback,
	finishPlayback,
	releaseSongMix,
	setSongMix,
	songForMix,
	songLink,
	songPicker,
	songsWantingMix,
	stemsWantingPlayback,
} = await import("./data");

const MINUTE = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);
const projectOf = (
	id: string,
	accountId: string,
	name: string,
	sortOrder: number,
	status = "active",
) => ({
	id,
	accountId,
	name,
	slug: id,
	status,
	sortOrder,
	isPrivate: false,
	isRestricted: false,
	noAi: false,
});
const songOf = (id: string, projectId: string, title: string, status = "active") => ({
	id,
	accountId: "a1",
	projectId,
	title,
	slug: id,
	status,
	isPrivate: false,
	noAi: false,
	mixUrl: null,
	mixKey: null,
	mixStartedAt: null,
	changes: [],
});
const stemOf = (
	id: string,
	songId: string,
	sortOrder: number,
	extra: Record<string, unknown> = {},
) => ({
	id,
	songId,
	accountId: "a1",
	label: id,
	sortOrder,
	gain: 1,
	status: "ready",
	url: `https://b/${id}.wav`,
	pathname: `accounts/a1/songs/${songId}/${id}.wav`,
	channels: 2,
	playbackStatus: null,
	playbackUrl: null,
	playbackPathname: null,
	playbackBytes: null,
	playbackStartedAt: null,
	...extra,
});
const fixtures = {
	account: [{ id: "a1", slug: "acme", name: "Acme" }],
	project: [
		projectOf("p1", "a1", "Proj", 2),
		projectOf("p2", "a1", "Beta", 1),
		projectOf("p3", "a1", "Old", 0, "archived"),
		projectOf("p4", "a2", "Theirs", 0),
	],
	song: [
		songOf("s1", "p1", "Zed"),
		songOf("s2", "p1", "Alpha"),
		songOf("s3", "p1", "Gone", "archived"),
		songOf("s4", "p2", "Only"),
	],
	stem: [
		stemOf("st1", "s1", 2),
		stemOf("st2", "s1", 1),
		stemOf("st3", "s1", 3, { status: "uploading" }),
		stemOf("st4", "s1", 4, { url: "" }),
	],
};
const songRow = (id: string) => fake.rows("song").find((r) => r.id === id)!;
const stemRow = (id: string) => fake.rows("stem").find((r) => r.id === id)!;

beforeEach(() => fake.reset(fixtures));

describe("songForMix", () => {
	it("null for no song", async () => {
		expect(await songForMix("nope")).toBeNull();
	});
	it("the song with its ready stems in order, its project and the account's name", async () => {
		const s = await songForMix("s1");
		expect(s?.title).toBe("Zed");
		expect(s?.stems.map((st) => st.id)).toEqual(["st2", "st1"]);
		expect(s?.project).toEqual({
			id: "p1",
			slug: "p1",
			name: "Proj",
			isPrivate: false,
			isRestricted: false,
			noAi: false,
			account: { name: "Acme" },
		});
	});
});

describe("setSongMix / releaseSongMix", () => {
	it("records the mix and drops the hold; null clears it", async () => {
		await setSongMix("s1", { url: "https://b/mix.m4a", key: "k1" });
		expect(songRow("s1")).toMatchObject({
			mixUrl: "https://b/mix.m4a",
			mixKey: "k1",
			mixStartedAt: null,
		});
		await setSongMix("s1", null);
		expect(songRow("s1")).toMatchObject({ mixUrl: null, mixKey: null });
	});
	it("releaseSongMix clears the hold alone", async () => {
		await setSongMix("s1", { url: "https://b/mix.m4a", key: "k1" });
		songRow("s1").mixStartedAt = ago(MINUTE);
		await releaseSongMix("s1");
		expect(songRow("s1")).toMatchObject({ mixUrl: "https://b/mix.m4a", mixStartedAt: null });
	});
});

describe("claimSongMix", () => {
	it("nothing to render when the cached mix already has the key", async () => {
		await setSongMix("s1", { url: "https://b/mix.m4a", key: "k1" });
		expect(await claimSongMix("s1", "k1")).toBe(false);
		expect(songRow("s1").mixStartedAt).toBeNull();
	});
	it("a song with no mix, or a mix with another key, is taken and held", async () => {
		const before = Date.now();
		expect(await claimSongMix("s1", "k1")).toBe(true);
		expect((songRow("s1").mixStartedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
		await setSongMix("s2", { url: "https://b/mix.m4a", key: "old" });
		expect(await claimSongMix("s2", "k1")).toBe(true);
	});
	it("a key with no file is rendered again", async () => {
		songRow("s1").mixKey = "k1";
		expect(await claimSongMix("s1", "k1")).toBe(true);
	});
	it("the update is the lock: a hold under fifteen minutes old refuses, a stale one is taken over", async () => {
		songRow("s1").mixStartedAt = ago(14 * MINUTE);
		expect(await claimSongMix("s1", "k1")).toBe(false);
		songRow("s1").mixStartedAt = ago(16 * MINUTE);
		expect(await claimSongMix("s1", "k1")).toBe(true);
		expect(await claimSongMix("s1", "k1")).toBe(false);
	});
	it("false for no song", async () => {
		expect(await claimSongMix("nope", "k1")).toBe(false);
	});
});

describe("songsWantingMix", () => {
	const st = (id: string, status = "ready", url = `https://b/${id}`) => ({
		id,
		status,
		url,
		playbackStatus: null,
		playbackUrl: null,
		gain: 1,
	});
	it("songs with ready stems whose mix is missing or keyed to other stems; the key is of the ready stems", () => {
		const seen: string[][] = [];
		const wanted = songsWantingMix(
			[
				{
					id: "none",
					mixKey: null,
					mixUrl: null,
					stems: [st("x", "uploading"), st("y", "ready", "")],
				},
				{ id: "fresh", mixKey: "a", mixUrl: null, stems: [st("a")] },
				{ id: "stale", mixKey: "old", mixUrl: "https://b/m", stems: [st("a")] },
				{ id: "ok", mixKey: "a", mixUrl: "https://b/m", stems: [st("a"), st("b", "uploading")] },
			],
			(stems) => {
				seen.push(stems.map((s) => s.id));
				return stems.map((s) => s.id).join(",");
			},
		);
		expect(wanted).toEqual(["fresh", "stale"]);
		// A song with no mix is wanted before its key is worked out; the others hand over their ready stems only.
		expect(seen).toEqual([["a"], ["a"]]);
	});
});

describe("stemsWantingPlayback", () => {
	const now = 1_800_000_000_000;
	const ps = (
		id: string,
		playbackStatus: string | null,
		ageMs: number | null,
		status = "ready",
	) => ({
		id,
		status,
		url: "https://b/x.wav",
		playbackStatus: playbackStatus as "pending" | "ready" | "failed" | null,
		playbackStartedAt: ageMs == null ? null : new Date(now - ageMs),
	});
	it("never tried, failed over an hour ago, or pending over fifteen minutes; ready stems only", () => {
		expect(
			stemsWantingPlayback(
				[
					ps("never", null, null),
					ps("failedOld", "failed", 61 * MINUTE),
					ps("failedNew", "failed", 59 * MINUTE),
					ps("stuck", "pending", 16 * MINUTE),
					ps("busy", "pending", 14 * MINUTE),
					ps("done", "ready", 0),
					ps("raw", null, null, "uploading"),
				],
				now,
			),
		).toEqual(["never", "failedOld", "stuck"]);
	});
});

describe("claimPlayback", () => {
	it("marks a never-rendered stem pending and hands back what the transcoder needs", async () => {
		const before = Date.now();
		expect(await claimPlayback("st1")).toEqual({
			id: "st1",
			songId: "s1",
			url: "https://b/st1.wav",
			pathname: "accounts/a1/songs/s1/st1.wav",
			channels: 2,
			playbackUrl: null,
		});
		expect(stemRow("st1").playbackStatus).toBe("pending");
		expect((stemRow("st1").playbackStartedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
	});
	it("the update is the lock: a fresh claim returns nothing, a stale one is taken", async () => {
		expect(await claimPlayback("st1")).not.toBeNull();
		expect(await claimPlayback("st1")).toBeNull();
		stemRow("st1").playbackStartedAt = ago(16 * MINUTE);
		expect(await claimPlayback("st1")).not.toBeNull();
	});
	it("a failure is retried after an hour, not before", async () => {
		await failPlayback("st2");
		stemRow("st2").playbackStartedAt = ago(30 * MINUTE);
		expect(await claimPlayback("st2")).toBeNull();
		stemRow("st2").playbackStartedAt = ago(2 * 60 * MINUTE);
		expect(await claimPlayback("st2")).not.toBeNull();
	});
	it("a stem that is not ready, or none, is never claimed", async () => {
		expect(await claimPlayback("st3")).toBeNull();
		expect(await claimPlayback("nope")).toBeNull();
		expect(stemRow("st3").playbackStatus).toBeNull();
	});
});

describe("finishPlayback / failPlayback", () => {
	it("records the rendition", async () => {
		await finishPlayback("st1", { url: "https://b/st1.m4a", pathname: "p/st1.m4a", bytes: 9 });
		expect(stemRow("st1")).toMatchObject({
			playbackStatus: "ready",
			playbackUrl: "https://b/st1.m4a",
			playbackPathname: "p/st1.m4a",
			playbackBytes: 9,
		});
	});
	it("marks the failure", async () => {
		await failPlayback("st1");
		expect(stemRow("st1").playbackStatus).toBe("failed");
		expect(stemRow("st2").playbackStatus).toBeNull();
	});
});

describe("songLink", () => {
	it("the song's title and page, in the account only", async () => {
		expect(await songLink("a1", "s1")).toEqual({
			id: "s1",
			title: "Zed",
			href: "/acme/projects/p1/s1",
		});
		expect(await songLink("a2", "s1")).toBeNull();
	});
});

describe("songPicker", () => {
	it("the account's active projects in order, each with its active songs by title", async () => {
		expect(await songPicker("a1")).toEqual([
			{ id: "p2", name: "Beta", songs: [{ id: "s4", title: "Only" }] },
			{
				id: "p1",
				name: "Proj",
				songs: [
					{ id: "s2", title: "Alpha" },
					{ id: "s1", title: "Zed" },
				],
			},
		]);
	});
});
