import { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { callsTo, fake, reset } from "../../../tests/helpers/fakeDataLayer";

const { createStem, getSong, mainStems, markStemReady, reorderStems, setDefaultMix, songForMix } =
	await import("./data");

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
