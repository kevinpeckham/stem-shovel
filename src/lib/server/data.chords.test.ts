import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { BeatThisBeats } from "#lib/utils/beatThisBeats.js";
import type { ChordminiRuns } from "#lib/utils/chordminiRuns.js";

// data.ts reaches the database and Blob; both are stubbed (nothing here touches Blob).
const { fake } = await vi.hoisted(async () => ({
	fake: (await import("../../../tests/helpers/fakeDb")).fakeDb(),
}));
vi.mock("#lib/server/db/index.js", async () => ({
	db: fake,
	schema: await import("#lib/server/db/schema/index.js"),
}));
vi.mock("#lib/server/blob.js", () => ({
	presentUrl: vi.fn(async (url: string | null | undefined) => url ?? null),
	deleteBlobs: vi.fn(async () => {}),
	recordingAccess: vi.fn(() => "private" as const),
}));

const {
	chordReadStatesAdmin,
	setSongChords,
	songDetectionsFor,
	songForChords,
	songsWantingChordsAdmin,
} = await import("./data");

const MINUTE = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);

const RUNS: ChordminiRuns = {
	version: "v1",
	frameSec: 0.5,
	frames: 4,
	runs: [{ start: 0, end: 4, chord: "C", label: "C:maj" }],
};
const BEATS: BeatThisBeats = {
	version: "b1",
	duration: 8,
	beats: [0, 0.5, 1, 1.5, 2],
	downbeats: [0, 2],
};

const songOf = (id: string, createdAt: number, extra: Record<string, unknown> = {}) => ({
	id,
	accountId: "a1",
	projectId: "p1",
	title: id,
	slug: id,
	status: "active",
	noAi: false,
	mixUrl: "https://b/mix.m4a",
	mixKey: "k1",
	chordsJson: null,
	chordsKey: null,
	beatsJson: null,
	beatsKey: null,
	chordsStartedAt: null,
	createdAt: new Date(createdAt),
	...extra,
});
const fixtures = {
	account: [{ id: "a1", slug: "acme", name: "Acme" }],
	project: [{ id: "p1", accountId: "a1", slug: "proj", name: "Proj", noAi: false }],
	song: [
		songOf("none", 1),
		songOf("both", 2, { chordsKey: "k1", beatsKey: "k1" }),
		songOf("chordsOnly", 3, { chordsKey: "k1" }),
		songOf("oldBeats", 4, { chordsKey: "k1", beatsKey: "k0" }),
		songOf("beatsOnly", 5, { beatsKey: "k1" }),
		songOf("noMix", 6, { mixUrl: null, mixKey: null }),
		songOf("noAi", 7, { noAi: true }),
		songOf("busy", 8, { chordsStartedAt: ago(MINUTE) }),
	],
};
const songRow = (id: string) => fake.rows("song").find((r) => r.id === id)!;

beforeEach(() => fake.reset(fixtures));

describe("songForChords", () => {
	it("carries the beats key beside the chords key", async () => {
		expect(await songForChords("oldBeats")).toMatchObject({
			id: "oldBeats",
			mixKey: "k1",
			chordsKey: "k1",
			beatsKey: "k0",
			project: { noAi: false },
		});
	});
});

describe("setSongChords", () => {
	it("stores the runs and the beats under the mix key and clears the claim", async () => {
		songRow("none").chordsStartedAt = ago(MINUTE);
		await setSongChords("none", "k1", RUNS, BEATS);
		expect(songRow("none")).toMatchObject({
			chordsJson: RUNS,
			chordsKey: "k1",
			beatsJson: BEATS,
			beatsKey: "k1",
			chordsStartedAt: null,
		});
		expect(songRow("both").chordsJson).toBeNull();
	});
});

describe("songDetectionsFor", () => {
	it("the chords and the beats when each was read from the current mix", async () => {
		await setSongChords("none", "k1", RUNS, BEATS);
		expect(await songDetectionsFor("a1", "none")).toEqual({
			chordsJson: RUNS,
			beatsJson: BEATS,
			mixKey: "k1",
		});
	});
	it("beats from an older mix are null; the chords still stand", async () => {
		await setSongChords("none", "k1", RUNS, BEATS);
		songRow("none").beatsKey = "k0";
		expect(await songDetectionsFor("a1", "none")).toEqual({
			chordsJson: RUNS,
			beatsJson: null,
			mixKey: "k1",
		});
	});
	it("chords from an older mix are null; the beats still stand", async () => {
		await setSongChords("none", "k1", RUNS, BEATS);
		songRow("none").chordsKey = "k0";
		expect(await songDetectionsFor("a1", "none")).toMatchObject({
			chordsJson: null,
			beatsJson: BEATS,
		});
	});
	it("nothing current without a mix file, and null in another account", async () => {
		await setSongChords("none", "k1", RUNS, BEATS);
		songRow("none").mixUrl = null;
		expect(await songDetectionsFor("a1", "none")).toEqual({
			chordsJson: null,
			beatsJson: null,
			mixKey: "k1",
		});
		expect(await songDetectionsFor("a2", "none")).toBeNull();
	});
});

describe("songsWantingChordsAdmin", () => {
	it("songs whose chords or beats are missing or behind the mix, oldest first; no mix, no AI or a fresh claim are left", async () => {
		expect(await songsWantingChordsAdmin(10)).toEqual({
			count: 4,
			ids: ["none", "chordsOnly", "oldBeats", "beatsOnly"],
		});
		expect(await songsWantingChordsAdmin(2)).toEqual({ count: 4, ids: ["none", "chordsOnly"] });
	});
	it("a stale claim is wanted again", async () => {
		songRow("busy").chordsStartedAt = ago(60 * MINUTE);
		expect((await songsWantingChordsAdmin(10)).ids).toContain("busy");
	});
});

describe("chordReadStatesAdmin", () => {
	it("done only when the chords and the beats are from the current mix", async () => {
		const states = await chordReadStatesAdmin(["both", "chordsOnly", "beatsOnly", "busy"]);
		const byId = Object.fromEntries(states.map((s) => [s.id, s.state]));
		expect(byId).toEqual({
			both: "done",
			chordsOnly: "waiting",
			beatsOnly: "waiting",
			busy: "reading",
		});
		expect(states.find((s) => s.id === "both")).toMatchObject({
			projectSlug: "proj",
			accountSlug: "acme",
			startedAt: null,
		});
	});
	it("no ids, no query", async () => {
		expect(await chordReadStatesAdmin([])).toEqual([]);
	});
});
