import { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { blob, callsTo, fake, reset } from "../../../tests/helpers/fakeDataLayer";
import { MAX_ARRANGEMENTS } from "#lib/constants/arrangements.js";

const {
	accountStorageBytes,
	accountUsage,
	arrangementOfSong,
	createArrangement,
	createStem,
	deleteArrangement,
	deleteStem,
	getSong,
	listArrangements,
	mainStems,
	markStemMidiReady,
	markStemReady,
	recordStemMidiUrl,
	removeStemMidi,
	reorderArrangements,
	reorderStems,
	reserveStemReplacement,
	setDefaultMix,
	songForMix,
	songsWantingMix,
	stemsOf,
	systemOverview,
	unsharedStemBlobs,
	updateArrangement,
} = await import("./data");

/**
 * Phase 1 of docs/arrangements.md: every read of "the song's stems" takes the
 * main arrangement only (`mainStems`). Each fixture holds an alternate's stem
 * (`arrangementId` set) beside Main's; the readers below must not see it.
 */
const at = (ms: number) => new Date(ms);
const a1 = { id: "a1", name: "Band", slug: "band" };
const p1 = {
	id: "p1",
	accountId: "a1",
	name: "Album",
	slug: "album",
	isPrivate: false,
	isRestricted: false,
	noAi: false,
};
const s1 = { id: "s1", accountId: "a1", projectId: "p1", title: "One", slug: "one", sortOrder: 0 };
const stemOf = (id: string, sortOrder: number, arrangementId: string | null = null) => ({
	id,
	accountId: "a1",
	songId: "s1",
	arrangementId,
	label: id,
	sortOrder,
	gain: 1,
	pan: 0,
	status: "ready",
	url: `https://blob/${id}.wav`,
	pathname: `accounts/a1/songs/s1/${id}.wav`,
	filename: `${id}.wav`,
	contentType: "audio/wav",
	sizeBytes: 100,
	muted: false,
	durationSeconds: 10,
	channels: 2,
	playbackStatus: "ready",
	playbackUrl: `https://blob/${id}-play.m4a`,
	createdAt: at(sortOrder + 1),
});
const fixtures = () => ({
	account: [a1],
	project: [p1],
	song: [s1],
	stem: [stemOf("m1", 0), stemOf("m2", 1), stemOf("alt1", 9, "arr1")],
});

/** Whether `cond` is `where` itself or one of the SQL nodes inside it. */
function carries(where: unknown, cond: SQL): boolean {
	if (where === cond) return true;
	if (!(where instanceof SQL)) return false;
	return where.queryChunks.some((c) => carries(c, cond));
}

beforeEach(() => reset(fixtures()));

describe("the song's stems mean Main", () => {
	test("the song page's read leaves an alternate's stems out", async () => {
		const got = await getSong("a1", "album", "one");
		expect(got?.stems.map((s) => s.id)).toEqual(["m1", "m2"]);
	});

	test("the mix render's read leaves an alternate's stems out", async () => {
		const got = await songForMix("s1");
		expect(got?.stems.map((s) => s.id)).toEqual(["m1", "m2"]);
	});

	test("an upload's next sort order follows Main's last stem, not an alternate's", async () => {
		const row = await createStem("a1", "u1", "s1", {
			filename: "Keys.wav",
			contentType: "audio/wav",
			sizeBytes: 10,
		});
		if (!row || row === "full") throw new Error("expected a row");
		expect(row.sortOrder).toBe(2);
		expect(row.arrangementId).toBeNull();
	});

	test("the reorder's ownership read carries the Main condition and leaves an alternate's stem where it was", async () => {
		const ids = await reorderStems("a1", "s1", ["alt1", "m2", "m1"]);
		expect(ids).toEqual(["m2", "m1"]);
		const read = fake.calls.find((c) => c.op === "findMany" && c.table === "stem");
		expect(carries(read?.where, mainStems)).toBe(true);
		expect(fake.rows("stem").find((r) => r.id === "alt1")?.sortOrder).toBe(9);
	});

	test("the default mix ignores an alternate's stem", async () => {
		expect(await setDefaultMix("a1", "s1", [{ id: "alt1", gain: 0.5 }])).toBe(false);
		expect(await setDefaultMix("a1", "s1", [{ id: "m1", gain: 0.5 }])).toBe(true);
		expect(fake.rows("stem").find((r) => r.id === "alt1")?.gain).toBe(1);
	});

	test("the song's length comes from Main's stems", async () => {
		reset({
			...fixtures(),
			stem: [stemOf("m1", 0), { ...stemOf("alt1", 1, "arr1"), durationSeconds: 99 }],
		});
		await markStemReady("a1", "m1", {
			url: "https://blob/m1.wav",
			durationSeconds: 12,
			channels: 2,
			peaks: [],
		});
		const max = callsTo("select", "stem").at(-1);
		expect(carries(max?.where, mainStems)).toBe(true);
		expect(fake.rows("song")[0].durationSeconds).toBe(12);
	});
});

/**
 * Phase 2 of docs/arrangements.md: alternates. An alternate is a
 * `song_arrangement` row; its stems are rows of the song carrying its id,
 * copies sharing their source's files, so a file goes only with the last
 * row naming it and storage counts it once.
 */
const u1 = { id: "u1", name: "Uma", email: "uma@x.test" };
const arr = (id: string, sortOrder: number, extra: Record<string, unknown> = {}) => ({
	id,
	accountId: "a1",
	songId: "s1",
	name: id,
	note: "",
	sortOrder,
	createdBy: "u1",
	createdAt: at(sortOrder + 1),
	...extra,
});
const s2 = { ...s1, id: "s2", slug: "two" };
/** A copy of Main's m1 in arr1: its own id, m1's files. */
const copyOf = (id: string, of: string, arrangementId: string) => ({
	...stemOf(of, 0, arrangementId),
	id,
});
const withAlternates = (extra: Record<string, unknown> = {}) =>
	reset({
		...fixtures(),
		user: [u1],
		song: [s1, s2],
		songArrangement: [arr("arr1", 0), arr("arr2", 1, { createdBy: null })],
		...extra,
	});
const stemRows = () => fake.rows("stem");
const arrangementRows = () => fake.rows("songArrangement");

describe("stemsOf", () => {
	test("null is Main's condition itself; an id is that alternate's", () => {
		expect(stemsOf(null)).toBe(mainStems);
		expect(stemsOf("arr1")).not.toBe(mainStems);
	});
});

describe("listArrangements and arrangementOfSong", () => {
	test("the song's alternates in order, with the creator and the ready stems counted", async () => {
		withAlternates({
			stem: [
				...fixtures().stem,
				{ ...stemOf("alt2", 1, "arr1"), status: "uploading" },
				stemOf("alt3", 0, "arr2"),
			],
			songArrangement: [arr("arr2", 1, { createdBy: null }), arr("arr1", 0)],
		});
		expect(await listArrangements("a1", "s1")).toEqual([
			{
				id: "arr1",
				name: "arr1",
				note: "",
				sortOrder: 0,
				createdAt: at(1),
				creator: { id: "u1", name: "Uma" },
				stemCount: 1,
			},
			{
				id: "arr2",
				name: "arr2",
				note: "",
				sortOrder: 1,
				createdAt: at(2),
				creator: null,
				stemCount: 1,
			},
		]);
		expect(await listArrangements("a2", "s1")).toEqual([]);
		expect(await listArrangements("a1", "s2")).toEqual([]);
	});
	test("an arrangement is found only through its own song and account", async () => {
		withAlternates();
		expect((await arrangementOfSong("a1", "s1", "arr1"))?.id).toBe("arr1");
		expect(await arrangementOfSong("a1", "s2", "arr1")).toBeNull();
		expect(await arrangementOfSong("a2", "s1", "arr1")).toBeNull();
	});
});

describe("getSong with an arrangement", () => {
	test("serves the alternate's stems and lists the song's alternates", async () => {
		withAlternates();
		const got = await getSong("a1", "album", "one", "arr1");
		expect(got?.stems.map((s) => s.id)).toEqual(["alt1"]);
		expect(got?.arrangementId).toBe("arr1");
		expect(got?.arrangements.map((a) => a.id)).toEqual(["arr1", "arr2"]);
	});
	test("an id that is not the song's serves Main and says so", async () => {
		withAlternates({ songArrangement: [arr("arr1", 0, { songId: "s2" })] });
		const got = await getSong("a1", "album", "one", "arr1");
		expect(got?.stems.map((s) => s.id)).toEqual(["m1", "m2"]);
		expect(got?.arrangementId).toBeNull();
		expect(got?.arrangements).toEqual([]);
	});
	test("without one it is Main, as before", async () => {
		withAlternates();
		const got = await getSong("a1", "album", "one");
		expect(got?.stems.map((s) => s.id)).toEqual(["m1", "m2"]);
		expect(got?.arrangementId).toBeNull();
	});
});

describe("createArrangement", () => {
	const make = (input: Partial<Parameters<typeof createArrangement>[3]> = {}) =>
		createArrangement("a1", "u1", "s1", {
			name: " Acoustic ",
			note: " capo 2 ",
			from: "main",
			...input,
		});

	test("copies Main's ready stems into a new alternate, last in order, sharing their files", async () => {
		withAlternates({
			stem: [
				{ ...stemOf("m1", 0), midiUrl: "https://blob/m1.mid", midiPathname: "m1.mid", tint: "red" },
				{ ...stemOf("m2", 1), playbackStatus: "pending", playbackStartedAt: at(5) },
				{ ...stemOf("m3", 2), status: "uploading" },
				stemOf("alt1", 9, "arr1"),
			],
		});
		const made = await make();
		if (!made?.ok) throw new Error("expected an arrangement");
		expect(arrangementRows().find((r) => r.id === made.id)).toMatchObject({
			accountId: "a1",
			songId: "s1",
			name: "Acoustic",
			note: "capo 2",
			sortOrder: 2,
			createdBy: "u1",
		});
		const copies = stemRows().filter((r) => r.arrangementId === made.id);
		expect(copies.map((c) => c.label)).toEqual(["m1", "m2"]);
		expect(copies.every((c) => c.id !== "m1" && c.id !== "m2")).toBe(true);
		expect(copies[0]).toMatchObject({
			url: "https://blob/m1.wav",
			pathname: "accounts/a1/songs/s1/m1.wav",
			playbackStatus: "ready",
			playbackUrl: "https://blob/m1-play.m4a",
			midiUrl: "https://blob/m1.mid",
			tint: "red",
			status: "ready",
			sortOrder: 0,
		});
		// A rendition still coming is the copy's own to render, never a hold it cannot clear.
		expect(copies[1]).toMatchObject({
			url: "https://blob/m2.wav",
			playbackStatus: null,
			playbackUrl: null,
			playbackStartedAt: null,
		});
		expect(blob.copyBlob).not.toHaveBeenCalled();
	});
	test("from an alternate copies that one's stems; from empty copies none", async () => {
		withAlternates();
		const fromAlt = await make({ name: "B", from: "arr1" });
		if (!fromAlt?.ok) throw new Error("expected an arrangement");
		expect(
			stemRows()
				.filter((r) => r.arrangementId === fromAlt.id)
				.map((r) => r.label),
		).toEqual(["alt1"]);
		const empty = await make({ name: "C", from: "empty" });
		if (!empty?.ok) throw new Error("expected an arrangement");
		expect(stemRows().filter((r) => r.arrangementId === empty.id)).toEqual([]);
	});
	test("refuses Main's name, a taken name in any case, a long note, and another song's arrangement", async () => {
		withAlternates({
			songArrangement: [arr("arr1", 0, { name: "Acoustic" }), arr("x", 0, { songId: "s2" })],
		});
		expect(await make({ name: "main" })).toMatchObject({ ok: false, field: "name" });
		expect(await make({ name: "ACOUSTIC" })).toMatchObject({ ok: false, field: "name" });
		expect(await make({ name: "  " })).toMatchObject({ ok: false, field: "name" });
		expect(await make({ name: "Live", note: "x".repeat(201) })).toMatchObject({
			ok: false,
			field: "note",
		});
		expect(await make({ name: "Live", from: "x" })).toMatchObject({ ok: false, field: "from" });
		expect(arrangementRows()).toHaveLength(2);
	});
	test(`stops at ${MAX_ARRANGEMENTS} alternates`, async () => {
		withAlternates({
			songArrangement: Array.from({ length: MAX_ARRANGEMENTS }, (_, i) => arr(`a${i}`, i)),
		});
		expect(await make()).toMatchObject({ ok: false, field: "name" });
	});
	test("null for another account's song", async () => {
		withAlternates();
		expect(await createArrangement("a2", "u1", "s1", { name: "X", from: "main" })).toBeNull();
	});
});

describe("updateArrangement", () => {
	test("renames and rewrites the note; a field left out stays; its own name is no clash", async () => {
		withAlternates({ songArrangement: [arr("arr1", 0, { name: "Acoustic", note: "n" })] });
		expect(await updateArrangement("a1", "arr1", { name: " acoustic " })).toEqual({
			ok: true,
			id: "arr1",
			songId: "s1",
		});
		expect(arrangementRows()[0]).toMatchObject({ name: "acoustic", note: "n" });
		await updateArrangement("a1", "arr1", { note: "capo 2" });
		expect(arrangementRows()[0]).toMatchObject({ name: "acoustic", note: "capo 2" });
	});
	test("refuses Main's name and another alternate's; null for another account's", async () => {
		withAlternates();
		expect(await updateArrangement("a1", "arr1", { name: "MAIN" })).toMatchObject({ ok: false });
		expect(await updateArrangement("a1", "arr1", { name: "arr2" })).toMatchObject({
			ok: false,
			field: "name",
		});
		expect(await updateArrangement("a2", "arr1", { name: "Mine" })).toBeNull();
		expect(arrangementRows()[0].name).toBe("arr1");
	});
});

describe("deleteArrangement", () => {
	test("deletes its rows and the files no other row names; a shared file stays", async () => {
		withAlternates({
			stem: [...fixtures().stem, copyOf("c1", "m1", "arr1")],
		});
		expect(await deleteArrangement("a1", "arr1")).toEqual({ songId: "s1" });
		expect(arrangementRows().map((r) => r.id)).toEqual(["arr2"]);
		expect(stemRows().map((r) => r.id)).toEqual(["m1", "m2"]);
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"https://blob/alt1.wav",
			"https://blob/alt1-play.m4a",
		]);
	});
	test("null for another account's, which keeps everything", async () => {
		withAlternates();
		expect(await deleteArrangement("a2", "arr1")).toBeNull();
		expect(stemRows()).toHaveLength(3);
		expect(blob.deleteBlobs).not.toHaveBeenCalled();
	});
});

describe("reorderArrangements", () => {
	test("puts the song's alternates in the given order; ids from elsewhere are ignored", async () => {
		withAlternates({
			songArrangement: [arr("arr1", 0), arr("arr2", 1), arr("x", 0, { songId: "s2" })],
		});
		expect(await reorderArrangements("a1", "s1", ["arr2", "x", "arr1"])).toEqual(["arr2", "arr1"]);
		expect(arrangementRows().map((r) => [r.id, r.sortOrder])).toEqual([
			["arr1", 1],
			["arr2", 0],
			["x", 0],
		]);
	});
});

describe("stem operations on an alternate", () => {
	test("an upload joins the alternate, after its last stem, under its own ceiling", async () => {
		withAlternates();
		const row = await createStem("a1", "u1", "s1", file, "arr1");
		if (!row || row === "full") throw new Error("expected a row");
		expect(row).toMatchObject({ arrangementId: "arr1", sortOrder: 10 });
		expect(await createStem("a1", "u1", "s1", file, "nope")).toBeNull();
		expect(await createStem("a1", "u1", "s2", file, "arr1")).toBeNull();
	});
	test("a reorder moves the alternate's stems only; another song's arrangement is null", async () => {
		withAlternates({ stem: [...fixtures().stem, stemOf("alt2", 10, "arr1")] });
		expect(await reorderStems("a1", "s1", ["alt2", "m1", "alt1"], "arr1")).toEqual([
			"alt2",
			"alt1",
		]);
		expect(stemRows().find((r) => r.id === "m1")?.sortOrder).toBe(0);
		expect(await reorderStems("a1", "s2", ["alt1"], "arr1")).toBeNull();
	});
	test("the default mix saves an alternate's faders and mutes; a mute left out stays", async () => {
		withAlternates({ stem: [...fixtures().stem, { ...stemOf("alt2", 10, "arr1"), muted: true }] });
		expect(
			await setDefaultMix(
				"a1",
				"s1",
				[
					{ id: "alt1", gain: 0.5, muted: true },
					{ id: "alt2", gain: 0.7 },
					{ id: "m1", gain: 0.1, muted: true },
				],
				"arr1",
			),
		).toBe(true);
		const byId = (id: string) => stemRows().find((r) => r.id === id);
		expect(byId("alt1")).toMatchObject({ gain: 0.5, muted: true });
		expect(byId("alt2")).toMatchObject({ gain: 0.7, muted: true });
		expect(byId("m1")).toMatchObject({ gain: 1, muted: false });
		expect(await setDefaultMix("a1", "s2", [{ id: "alt1", gain: 0.2 }], "arr1")).toBe(false);
	});
});

const file = { filename: "Keys.wav", contentType: "audio/wav", sizeBytes: 10 };

describe("shared files", () => {
	const shared = () => withAlternates({ stem: [...fixtures().stem, copyOf("c1", "m1", "arr1")] });

	test("unsharedStemBlobs answers the urls no row names as a file, a rendition or a MIDI file", async () => {
		shared();
		fake.rows("stem").find((r) => r.id === "m2")!.midiUrl = "https://blob/m2.mid";
		expect(
			await unsharedStemBlobs([
				"https://blob/m1.wav",
				"https://blob/m2.mid",
				"https://blob/gone.wav",
				"https://blob/gone.wav",
				null,
				"",
			]),
		).toEqual(["https://blob/gone.wav"]);
		expect(await unsharedStemBlobs([])).toEqual([]);
	});
	test("deleting a stem keeps the files its copy still names, and drops them with the last row", async () => {
		shared();
		await deleteStem("a1", "m1");
		expect(blob.deleteBlobs).not.toHaveBeenCalled();
		await deleteStem("a1", "c1");
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"https://blob/m1.wav",
			"https://blob/m1-play.m4a",
		]);
	});
	test("replacing a copy keeps the file Main's stem still plays; replacing the last holder drops it", async () => {
		shared();
		const row = await reserveStemReplacement("a1", "c1", file);
		expect(row?.pathname).toBe("accounts/a1/songs/s1/c1-v1.wav");
		expect(blob.deleteBlobs).not.toHaveBeenCalled();
		await reserveStemReplacement("a1", "m1", file);
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"https://blob/m1.wav",
			"https://blob/m1-play.m4a",
		]);
	});
	test("a MIDI file a copy shares survives a new one, a webhook's and a removal on the other row", async () => {
		const midi = "https://blob/m1.mid";
		withAlternates({
			stem: [
				{ ...stemOf("m1", 0), midiUrl: midi, midiPathname: "m1.mid" },
				{ ...copyOf("c1", "m1", "arr1"), midiUrl: midi, midiPathname: "m1.mid" },
			],
		});
		await markStemMidiReady("a1", "m1", "https://blob/m1-new.mid");
		expect(blob.deleteBlobs).not.toHaveBeenCalled();
		// m1's new file is its alone: removing it drops it.
		await removeStemMidi("a1", "m1");
		expect(blob.deleteBlobs).toHaveBeenLastCalledWith(["https://blob/m1-new.mid"]);
		fake.rows("stem").find((r) => r.id === "c1")!.midiPathname = "c1-new.mid";
		await recordStemMidiUrl("c1-new.mid", "https://blob/c1-new.mid");
		expect(blob.deleteBlobs).toHaveBeenCalledWith([midi]);
	});
});

describe("storage counts a shared file once", () => {
	const stems = () => [
		{ ...stemOf("m1", 0), sizeBytes: 100 },
		{ ...stemOf("m2", 1), sizeBytes: 50, status: "uploading" },
		{ ...copyOf("c1", "m1", "arr1"), sizeBytes: 100 },
		{ ...copyOf("c2", "m1", "arr2"), sizeBytes: 100 },
		{ ...stemOf("x1", 0), accountId: "a2", pathname: "accounts/a2/x1.wav", sizeBytes: 7 },
	];
	test("the account's bytes, its settings counts and the admin's totals", async () => {
		withAlternates({
			account: [{ ...a1, plan: "free", isFounder: false, storageLimitBytes: null }],
			stem: stems(),
		});
		expect(await accountStorageBytes("a1")).toBe(150);
		const usage = await accountUsage("a1");
		expect(usage.stems).toBe(1);
		expect(usage.bytes).toBe(100);
		const overview = await systemOverview();
		expect(overview.accounts.find((a) => a.id === "a1")?.bytes).toBe(100);
	});
});

describe("mutes and the rendered mix", () => {
	test("songForMix carries each stem's mute", async () => {
		reset({ ...fixtures(), stem: [{ ...stemOf("m1", 0), muted: true }, stemOf("m2", 1)] });
		expect((await songForMix("s1"))?.stems.map((s) => [s.id, s.muted])).toEqual([
			["m1", true],
			["m2", false],
		]);
	});
	test("a song whose ready stems are all muted wants no mix", () => {
		const st = (id: string, muted: boolean) => ({
			id,
			status: "ready",
			url: `https://b/${id}`,
			playbackStatus: null,
			playbackUrl: null,
			gain: 1,
			muted,
		});
		const wanted = songsWantingMix(
			[
				{ id: "silent", mixKey: null, mixUrl: null, stems: [st("a", true)] },
				{ id: "some", mixKey: null, mixUrl: null, stems: [st("a", true), st("b", false)] },
			],
			() => "k",
		);
		expect(wanted).toEqual(["some"]);
	});
});
