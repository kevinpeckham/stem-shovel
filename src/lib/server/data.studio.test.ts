import { MAX_STUDIO_SOURCES, STUDIO_AUTOSAVES_KEPT } from "$lib/constants/studio";
import { arrangementHash } from "$lib/utils/arrangementHash";
import type { StudioArrangement, StudioSourceReserve } from "$lib/val/StudioSchema";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

// data.ts reaches the database and Blob; both are stubbed. Blob's helpers
// that the Studio functions call are the pure parts, written out here.
const { fake, blob } = await vi.hoisted(async () => ({
	fake: (await import("../../../tests/helpers/fakeDb")).fakeDb(),
	blob: {
		presentUrl: vi.fn(async (url: string | null | undefined) => url ?? null),
		deleteBlobs: vi.fn(async () => {}),
		recordingAccess: vi.fn(() => "private" as const),
		studioSourcePathname: (accountId: string, ideaId: string, sourceId: string, filename: string) =>
			`accounts/${accountId}/studio/${ideaId}/${sourceId}.${(filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? "bin").toLowerCase()}`,
	},
}));
vi.mock("$lib/server/db", async () => ({
	db: fake,
	schema: await import("$lib/server/db/schema"),
}));
vi.mock("$lib/server/blob", () => blob);

const {
	createStudioSource,
	deleteStudioRevision,
	deleteStudioSource,
	listStudioSongs,
	restoreStudioRevision,
	saveStudioAutosave,
} = await import("./data");

const arrangement = (bpm: number): StudioArrangement => ({
	version: 1,
	bpm,
	beatsPerBar: 4,
	gridOn: true,
	countIn: false,
	click: false,
	loop: null,
	master: 1,
	tracks: [],
	clips: [],
});
const at = (minute: number) => new Date(Date.UTC(2026, 9, 7, 12, minute));
/** A revision row of idea i1 in a1, hashed like the server hashes. */
const revision = (id: string, number: number, name: string | null, data: StudioArrangement) => ({
	id,
	accountId: "a1",
	ideaId: "i1",
	savedBy: "u1",
	name,
	number,
	data,
	hash: arrangementHash(data),
	createdAt: at(number),
	updatedAt: at(number),
});
const idea = { id: "i1", accountId: "a1", createdBy: "u1", kind: "song", title: "Song", notes: "" };
const inserts = (table: string) => fake.calls.filter((c) => c.op === "insert" && c.table === table);
const deletes = (table: string) => fake.calls.filter((c) => c.op === "delete" && c.table === table);

beforeEach(() => {
	fake.reset();
	blob.deleteBlobs.mockClear();
	blob.presentUrl.mockClear();
});

describe("saveStudioAutosave", () => {
	test("null for an idea the account does not hold, with nothing written", async () => {
		fake.reset({ idea: [{ ...idea, accountId: "a2" }] });
		expect(await saveStudioAutosave("a1", "u1", "i1", arrangement(120))).toBeNull();
		expect(inserts("studio_revision")).toEqual([]);
	});
	test("the newest revision already holding this arrangement means no write, named or not", async () => {
		fake.reset({
			idea: [idea],
			studioRevision: [
				revision("v1", 1, null, arrangement(100)),
				revision("v2", 2, "Keeper", arrangement(120)),
			],
		});
		expect(await saveStudioAutosave("a1", "u1", "i1", arrangement(120))).toEqual({
			id: "v2",
			number: 2,
			unchanged: true,
		});
		expect(inserts("studio_revision")).toEqual([]);
		// An older revision with the same arrangement does not count: the newest is what the song shows.
		expect((await saveStudioAutosave("a1", "u1", "i1", arrangement(100)))?.unchanged).toBe(false);
	});
	test("a changed arrangement is the next number, unnamed, and bumps the idea", async () => {
		fake.reset({
			idea: [{ ...idea, updatedAt: at(0) }],
			studioRevision: [
				revision("v3", 3, null, arrangement(100)),
				revision("v5", 5, "Named", arrangement(110)),
			],
		});
		const saved = await saveStudioAutosave("a1", "u1", "i1", arrangement(120));
		expect(saved).toMatchObject({ number: 6, unchanged: false });
		expect(inserts("studio_revision")[0].values).toMatchObject({
			accountId: "a1",
			ideaId: "i1",
			savedBy: "u1",
			name: null,
			number: 6,
			data: arrangement(120),
			hash: arrangementHash(arrangement(120)),
		});
		const row = fake.rows("studioRevision").find((r) => r.number === 6);
		expect(row?.id).toBe(saved?.id);
		expect(fake.rows("idea")[0].updatedAt).not.toEqual(at(0));
		expect(deletes("studio_revision")).toEqual([]);
	});
	test("autosaves beyond STUDIO_AUTOSAVES_KEPT go, oldest first; named revisions stay and do not count", async () => {
		const rows = [];
		for (let n = 1; n <= STUDIO_AUTOSAVES_KEPT; n++)
			rows.push(revision(`auto${n}`, n, null, arrangement(n)));
		rows.push(revision("named", 50, "Mix 1", arrangement(50)));
		rows.push(revision("named0", 0, "First", arrangement(0)));
		fake.reset({ idea: [idea], studioRevision: rows });
		const saved = await saveStudioAutosave("a1", "u1", "i1", arrangement(999));
		expect(saved).toMatchObject({ number: 51, unchanged: false });
		expect(deletes("studio_revision")).toHaveLength(1);
		const left = fake.rows("studioRevision").map((r) => r.id);
		expect(left).not.toContain("auto1");
		expect(left).toContain("auto2");
		expect(left).toContain("named");
		expect(left).toContain("named0");
		expect(left.filter((id) => id !== "named" && id !== "named0")).toHaveLength(
			STUDIO_AUTOSAVES_KEPT,
		);
	});
});

describe("createStudioSource", () => {
	const reserve: StudioSourceReserve = {
		ideaId: "i1",
		kind: "take",
		trackLabel: "Guitar",
		takeNumber: 2,
		filename: "Guitar take 2.WAV",
		sizeBytes: 1024,
		codec: "pcm",
		sampleRate: 48_000,
		channels: 1,
		durationSeconds: 3.5,
	};
	beforeEach(() =>
		fake.reset({ idea: [idea], studioSource: [{ id: "taken", accountId: "a1", ideaId: "i1" }] }),
	);
	test("null without the idea in the account", async () => {
		expect(await createStudioSource("a2", "u1", reserve)).toBeNull();
		expect(inserts("studio_source")).toEqual([]);
	});
	test("'unsupported' for a file type no demo takes, before any id is checked", async () => {
		expect(
			await createStudioSource("a1", "u1", { ...reserve, id: "taken", filename: "notes.txt" }),
		).toBe("unsupported");
		expect(fake.calls.filter((c) => c.table === "studio_source")).toEqual([]);
	});
	test("'exists' when the browser's id is already a row", async () => {
		expect(await createStudioSource("a1", "u1", { ...reserve, id: "taken" })).toBe("exists");
		expect(inserts("studio_source")).toEqual([]);
	});
	test("'full' at MAX_STUDIO_SOURCES in this song, counting ones still uploading but not another song's", async () => {
		const mine = Array.from({ length: MAX_STUDIO_SOURCES }, (_, i) => ({
			id: `s${i}`,
			accountId: "a1",
			ideaId: "i1",
			status: i % 2 ? "ready" : "uploading",
		}));
		fake.reset({
			idea: [idea, { ...idea, id: "i2" }],
			studioSource: [...mine, { id: "other", accountId: "a1", ideaId: "i2" }],
		});
		expect(await createStudioSource("a1", "u1", reserve)).toBe("full");
		expect(await createStudioSource("a1", "u1", { ...reserve, ideaId: "i2" })).toMatchObject({
			pathname: expect.stringContaining("/studio/i2/"),
		});
		fake.reset({ idea: [idea], studioSource: mine.slice(1) });
		expect(await createStudioSource("a1", "u1", reserve)).not.toBe("full");
	});
	test("the row keeps the browser's id, the pathname is under the song with the file's extension, and the store is the recordings'", async () => {
		const made = await createStudioSource("a1", "u1", { ...reserve, id: "browserMintedId000001" });
		expect(made).toEqual({
			sourceId: "browserMintedId000001",
			pathname: "accounts/a1/studio/i1/browserMintedId000001.wav",
			access: "private",
		});
		expect(inserts("studio_source")[0].values).toEqual({
			id: "browserMintedId000001",
			accountId: "a1",
			ideaId: "i1",
			recordedBy: "u1",
			kind: "take",
			takeNumber: 2,
			trackLabel: "Guitar",
			url: "",
			pathname: "accounts/a1/studio/i1/browserMintedId000001.wav",
			filename: "Guitar take 2.WAV",
			contentType: "audio/wav",
			sizeBytes: 1024,
			codec: "pcm",
			sampleRate: 48_000,
			channels: 1,
			durationSeconds: 3.5,
		});
		expect(fake.rows("studioSource").find((s) => s.id === "browserMintedId000001")).toMatchObject({
			status: "uploading",
			peaks: null,
		});
	});
	test("without an id the server mints a nanoid", async () => {
		const made = await createStudioSource("a1", "u1", reserve);
		expect(made).not.toBeNull();
		if (typeof made !== "object" || made === null) throw new Error("expected a row");
		expect(made.sourceId).toMatch(/^[A-Za-z0-9_-]{21}$/);
		expect(made.pathname).toBe(`accounts/a1/studio/i1/${made.sourceId}.wav`);
	});
});

describe("deleteStudioSource", () => {
	test("removes the row of this account and its file; another account's is false and keeps its file", async () => {
		fake.reset({
			studioSource: [
				{ id: "s1", accountId: "a1", ideaId: "i1", url: "https://blob/s1.wav" },
				{ id: "s2", accountId: "a2", ideaId: "i2", url: "https://blob/s2.wav" },
			],
		});
		expect(await deleteStudioSource("a1", "s1")).toBe(true);
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://blob/s1.wav"]);
		expect(await deleteStudioSource("a1", "s2")).toBe(false);
		expect(blob.deleteBlobs).toHaveBeenCalledTimes(1);
		expect(fake.rows("studioSource").map((s) => s.id)).toEqual(["s2"]);
	});
});

describe("restoreStudioRevision", () => {
	beforeEach(() =>
		fake.reset({
			idea: [idea],
			studioRevision: [
				revision("v1", 1, "Early", arrangement(90)),
				revision("v2", 2, null, arrangement(100)),
				revision("v3", 3, null, arrangement(120)),
			],
		}),
	);
	test("null for a revision the account does not hold", async () => {
		expect(await restoreStudioRevision("a2", "u1", "v1")).toBeNull();
		expect(await restoreStudioRevision("a1", "u1", "nope")).toBeNull();
		expect(inserts("studio_revision")).toEqual([]);
	});
	test("an older revision's data is written forward as a new autosave and handed back", async () => {
		const restored = await restoreStudioRevision("a1", "u1", "v1");
		expect(restored?.data).toEqual(arrangement(90));
		expect(restored?.revision).toMatchObject({ number: 4, name: null });
		expect(restored?.revision.createdAt).toBeInstanceOf(Date);
		expect(inserts("studio_revision")[0].values).toMatchObject({
			number: 4,
			name: null,
			data: arrangement(90),
		});
		// History is kept: the restored revision is still there, under its name.
		expect(fake.rows("studioRevision").map((r) => [r.id, r.name])).toEqual([
			["v1", "Early"],
			["v2", null],
			["v3", null],
			[restored?.revision.id, null],
		]);
	});
	test("restoring the newest writes nothing and answers it as it is", async () => {
		const restored = await restoreStudioRevision("a1", "u1", "v3");
		expect(restored?.data).toEqual(arrangement(120));
		expect(restored?.revision).toEqual({ id: "v3", number: 3, name: null, createdAt: at(3) });
		expect(inserts("studio_revision")).toEqual([]);
	});
});

describe("deleteStudioRevision", () => {
	beforeEach(() =>
		fake.reset({
			studioRevision: [
				revision("v1", 1, "Early", arrangement(90)),
				revision("v2", 2, null, arrangement(100)),
				revision("v3", 3, "Latest", arrangement(120)),
				{ ...revision("v9", 9, "Elsewhere", arrangement(1)), accountId: "a2" },
			],
		}),
	);
	test("an autosave, the newest revision, another account's and a stranger are all refused without a delete", async () => {
		expect(await deleteStudioRevision("a1", "v2")).toBe(false);
		expect(await deleteStudioRevision("a1", "v3")).toBe(false);
		expect(await deleteStudioRevision("a1", "v9")).toBe(false);
		expect(await deleteStudioRevision("a1", "nope")).toBe(false);
		expect(deletes("studio_revision")).toEqual([]);
		expect(fake.rows("studioRevision")).toHaveLength(4);
	});
	test("an older named revision goes", async () => {
		expect(await deleteStudioRevision("a1", "v1")).toBe(true);
		expect(deletes("studio_revision")).toHaveLength(1);
		expect(fake.rows("studioRevision").map((r) => r.id)).toEqual(["v2", "v3", "v9"]);
	});
});

describe("listStudioSongs", () => {
	test("the user's songs alone, newest first, each with its current arrangement, revisions newest first and ready sources in take order", async () => {
		const source = (id: string, over: Record<string, unknown>) => ({
			id,
			accountId: "a1",
			ideaId: "i1",
			recordedBy: "u1",
			kind: "take",
			takeNumber: 1,
			trackLabel: "Guitar",
			status: "ready",
			url: `https://blob/${id}.wav`,
			pathname: `accounts/a1/studio/i1/${id}.wav`,
			filename: `${id}.wav`,
			contentType: "audio/wav",
			sizeBytes: 10,
			codec: "pcm",
			sampleRate: 48_000,
			channels: 1,
			durationSeconds: 2,
			peaks: null,
			createdAt: at(1),
			...over,
		});
		fake.reset({
			idea: [
				{ ...idea, createdAt: at(1) },
				{ ...idea, id: "i2", title: "Newer", createdAt: at(2) },
				{ ...idea, id: "i3", kind: "idea", createdAt: at(3) },
				{ ...idea, id: "i4", kind: "loop", createdAt: at(4) },
				{ ...idea, id: "i5", createdBy: "u2", createdAt: at(5) },
				{
					...idea,
					id: "i6",
					accountId: "a2",
					title: "Other account, still mine",
					createdAt: at(0),
				},
			],
			studioRevision: [
				revision("v1", 1, "Early", arrangement(90)),
				revision("v2", 2, null, arrangement(100)),
				{ ...revision("v5", 5, "Theirs", arrangement(5)), ideaId: "i5" },
			],
			studioSource: [
				source("late", { takeNumber: 3, createdAt: at(1) }),
				source("early", { takeNumber: 1, createdAt: at(2) }),
				source("earlier", { takeNumber: 1, createdAt: at(1), peaks: [0.5] }),
				source("pending", { takeNumber: 0, status: "uploading" }),
				source("theirs", { ideaId: "i5" }),
			],
		});
		const songs = await listStudioSongs("u1");
		expect(songs.map((s) => [s.id, s.title])).toEqual([
			["i2", "Newer"],
			["i1", "Song"],
			["i6", "Other account, still mine"],
		]);
		const [newer, song, other] = songs;
		expect(newer).toMatchObject({ current: null, revisions: [], sources: [] });
		expect(other.current).toBeNull();
		expect(song.current).toEqual(arrangement(100));
		expect(song.revisions).toEqual([
			{ id: "v2", number: 2, name: null, createdAt: at(2) },
			{ id: "v1", number: 1, name: "Early", createdAt: at(1) },
		]);
		expect(song.sources.map((s) => s.id)).toEqual(["earlier", "early", "late"]);
		expect(song.sources[0]).toEqual({
			id: "earlier",
			kind: "take",
			takeNumber: 1,
			trackLabel: "Guitar",
			url: "https://blob/earlier.wav",
			filename: "earlier.wav",
			codec: "pcm",
			sampleRate: 48_000,
			channels: 1,
			durationSeconds: 2,
			sizeBytes: 10,
			peaks: [0.5],
			createdAt: at(1),
		});
		expect(song.sources[1].peaks).toEqual([]);
		expect(blob.presentUrl).toHaveBeenCalledTimes(3);
		// The newest revisions' data came in one query, for the songs that have one.
		expect(
			fake.calls.filter((c) => c.op === "select" && c.table === "studio_revision"),
		).toHaveLength(1);
	});
	test("a user without songs gets an empty list and no second query", async () => {
		fake.reset({ idea: [{ ...idea, createdBy: "u2" }] });
		expect(await listStudioSongs("u1")).toEqual([]);
		expect(fake.calls.map((c) => c.op)).toEqual(["findMany"]);
	});
});
