import { barGrid } from "#lib/audio/measures.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { blob, callsTo, cascade, fake, reset } from "../../../tests/helpers/fakeDataLayer";

const {
	createSong,
	deleteSong,
	getSong,
	setSongVersion,
	songGrid,
	updateSong,
	updateSongChanges,
	updateSongSections,
} = await import("./data");

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const at = (ms: number) => new Date(ms);
const a1 = { id: "a1", name: "Band", slug: "band", defaultArtistId: null };
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
const aliases = () => fake.rows("slugAlias").map((r) => [r.kind, r.scopeId, r.slug, r.targetId]);
const songInput = {
	title: " Two ",
	slug: "two",
	description: " d ",
	writtenOn: "",
	startAt: "",
	endAt: "",
	frameRate: "25",
	version: "0.0.1",
};

beforeAll(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => reset({ account: [a1], project: [p1], song: [s1] }));

describe("createSong", () => {
	test("a slug unique within the project, placed last; the live slug drops its alias", async () => {
		reset({
			account: [a1],
			project: [p1],
			song: [s1, { ...s1, id: "s2", slug: "one-2", sortOrder: 4 }],
			slugAlias: [{ kind: "song", scopeId: "p1", slug: "one-3", targetId: "old" }],
		});
		const made = await createSong("a1", "u1", "p1", " One ");
		expect(made).toMatchObject({
			accountId: "a1",
			projectId: "p1",
			title: "One",
			slug: "one-3",
			createdBy: "u1",
			sortOrder: 5,
			status: "active",
		});
		expect(aliases()).toEqual([]);
		expect(callsTo("insert", "song_credit")).toEqual([]);
	});
	test("the first song of a project is sortOrder 0, and a blank title is 'song'", async () => {
		reset({ account: [a1], project: [p1] });
		expect(await createSong("a1", "u1", "p1", "!!")).toMatchObject({ slug: "song", sortOrder: 0 });
	});
	test("the account's default artist performs it, when that artist is the account's", async () => {
		reset({
			account: [{ ...a1, defaultArtistId: "ar1" }],
			artist: [{ id: "ar1", accountId: "a1" }],
		});
		const made = await createSong("a1", "u1", "p1", "Two");
		expect(callsTo("insert", "song_credit")[0].values).toEqual({
			songId: made.id,
			artistId: "ar1",
			role: "performer",
			sortOrder: 1,
		});
		reset({
			account: [{ ...a1, defaultArtistId: "ar1" }],
			artist: [{ id: "ar1", accountId: "a2" }],
		});
		await createSong("a1", "u1", "p1", "Three");
		expect(callsTo("insert", "song_credit")).toEqual([]);
	});
});

describe("updateSong", () => {
	test("writes the fields, parsing the numbers and blanking empty dates; the old slug becomes an alias", async () => {
		const result = await updateSong("a1", "s1", {
			...songInput,
			writtenOn: "2026-01-02",
			startAt: "1.5",
			endAt: "200",
			frameRate: "29.97",
			version: "1.2.3",
		});
		expect(result).toMatchObject({
			ok: true,
			song: {
				title: "Two",
				slug: "two",
				description: "d",
				writtenOn: "2026-01-02",
				startAt: 1.5,
				endAt: 200,
				frameRate: 29.97,
				version: "1.2.3",
			},
		});
		expect(aliases()).toEqual([["song", "p1", "one", "s1"]]);
		expect((await updateSong("a1", "s1", { ...songInput, slug: "two" })).ok).toBe(true);
		expect(fake.rows("song")[0]).toMatchObject({ writtenOn: null, startAt: null, endAt: null });
		expect(aliases()).toEqual([["song", "p1", "one", "s1"]]);
	});
	test("a slug of another song in the project is refused; the same slug in another project is fine", async () => {
		reset({
			song: [
				s1,
				{ ...s1, id: "s2", slug: "two" },
				{ ...s1, id: "s3", slug: "three", projectId: "p2" },
			],
		});
		expect(await updateSong("a1", "s1", songInput)).toEqual({
			ok: false,
			field: "slug",
			error: 'Another song in this project already uses "two".',
		});
		expect((await updateSong("a1", "s1", { ...songInput, slug: "three" })).ok).toBe(true);
	});
	test("a blank title, a bad slug and another account's song are errors without a write", async () => {
		expect(await updateSong("a1", "s1", { ...songInput, title: " " })).toEqual({
			ok: false,
			field: "title",
			error: "Give the song a title.",
		});
		expect(await updateSong("a1", "s1", { ...songInput, slug: "Two!" })).toMatchObject({
			ok: false,
			field: "slug",
		});
		expect(await updateSong("a2", "s1", songInput)).toEqual({
			ok: false,
			field: "title",
			error: "Song not found.",
		});
		expect(callsTo("update", "song")).toEqual([]);
	});
});

describe("getSong", () => {
	test("the song by project and song slug within the account, with its files in order and its project", async () => {
		reset({
			project: [p1],
			song: [s1],
			stem: [
				{ id: "st2", songId: "s1", sortOrder: 1, createdAt: at(1) },
				{ id: "st1", songId: "s1", sortOrder: 0, createdAt: at(2) },
				{ id: "st0", songId: "s1", sortOrder: 0, createdAt: at(1) },
			],
			demo: [
				{ id: "d2", songId: "s1", createdAt: at(2) },
				{ id: "d1", songId: "s1", createdAt: at(1) },
			],
			artist: [{ id: "ar1", accountId: "a1", name: "Ann" }],
			songCredit: [{ id: "c1", songId: "s1", artistId: "ar1", role: "writer", sortOrder: 1 }],
		});
		const got = await getSong("a1", "album", "one");
		expect(got?.id).toBe("s1");
		expect(got?.project).toEqual({
			id: "p1",
			name: "Album",
			slug: "album",
			isPrivate: false,
			isRestricted: false,
			noAi: false,
		});
		expect(got?.stems.map((s) => s.id)).toEqual(["st0", "st1", "st2"]);
		expect(got?.demos.map((d) => d.id)).toEqual(["d1", "d2"]);
		expect(got?.files).toEqual([]);
		expect(got?.notation).toEqual([]);
		expect(got?.credits).toEqual([
			{
				id: "c1",
				songId: "s1",
				artistId: "ar1",
				role: "writer",
				sortOrder: 1,
				artist: { id: "ar1", name: "Ann" },
			},
		]);
		expect(await getSong("a2", "album", "one")).toBeNull();
		expect(await getSong("a1", "album", "two")).toBeNull();
	});
});

describe("deleteSong", () => {
	test("collects every file of the song (stems, renditions, MIDI, demos, attachments, notation, mix), deletes them and cascades the rows", async () => {
		reset({
			song: [{ ...s1, mixUrl: "mix" }],
			stem: [
				{ accountId: "a1", songId: "s1", url: "st", playbackUrl: "stp", midiUrl: "stm" },
				{ accountId: "a1", songId: "s2", url: "other" },
			],
			demo: [{ accountId: "a1", songId: "s1", url: "d", playbackUrl: null }],
			songFile: [{ accountId: "a1", songId: "s1", url: "f", thumbnailUrl: "ft" }],
			songNotation: [{ accountId: "a1", songId: "s1", url: "n", thumbnailUrl: null, pdfUrl: "np" }],
		});
		await deleteSong("a1", "s1");
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"st",
			"stp",
			"stm",
			"d",
			"",
			"f",
			"ft",
			"n",
			"",
			"np",
			"mix",
		]);
		expect(cascade.deleteSongRows).toHaveBeenCalledWith(["s1"]);
	});
	test("another account's song is left alone", async () => {
		reset({ song: [s1], stem: [{ accountId: "a1", songId: "s1", url: "st" }] });
		await deleteSong("a2", "s1");
		expect(blob.deleteBlobs).toHaveBeenCalledWith([""]);
		expect(cascade.deleteSongRows).not.toHaveBeenCalled();
	});
});

describe("setSongVersion", () => {
	test("sets the version within the account", async () => {
		expect(await setSongVersion("a1", "s1", "2.0.0")).toEqual({ version: "2.0.0" });
		expect(await setSongVersion("a2", "s1", "3.0.0")).toBeNull();
		expect(fake.rows("song")[0].version).toBe("2.0.0");
	});
});

describe("updateSongSections", () => {
	test("trims, rounds to a tenth of a millisecond and sorts by start", async () => {
		const result = await updateSongSections("a1", "s1", [
			{ index: " B ", name: " Chorus ", start: 30.00004 },
			{ index: "", name: "Verse", start: 10.12345 },
		]);
		expect(result).toEqual({
			ok: true,
			sections: [
				{ index: "", name: "Verse", start: 10.1235 },
				{ index: "B", name: "Chorus", start: 30 },
			],
		});
		expect(fake.rows("song")[0].sections).toEqual(result.ok && result.sections);
	});
	test("two sections at one time, or a song of another account, are errors", async () => {
		expect(
			await updateSongSections("a1", "s1", [
				{ index: "", name: "A", start: 5 },
				{ index: "", name: "B", start: 5 },
			]),
		).toEqual({ ok: false, error: "Two sections start at 5s." });
		expect(await updateSongSections("a2", "s1", [{ index: "", name: "A", start: 0 }])).toEqual({
			ok: false,
			error: "Song not found.",
		});
		expect(callsTo("update", "song")).toHaveLength(1);
		expect(fake.rows("song")[0].sections).toBeUndefined();
	});
});

describe("updateSongChanges", () => {
	test("sorted by start then kind, values trimmed; one of each kind per time", async () => {
		const result = await updateSongChanges("a1", "s1", [
			{ kind: "tempo", start: 0, value: " 120 " },
			{ kind: "key", start: 0, value: "C" },
			{ kind: "tempo", start: 8.00001, value: "90" },
		]);
		expect(result).toEqual({
			ok: true,
			changes: [
				{ kind: "key", start: 0, value: "C" },
				{ kind: "tempo", start: 0, value: "120" },
				{ kind: "tempo", start: 8, value: "90" },
			],
		});
		expect(
			await updateSongChanges("a1", "s1", [
				{ kind: "tempo", start: 1, value: "100" },
				{ kind: "tempo", start: 1, value: "110" },
			]),
		).toEqual({ ok: false, error: "Two tempo changes start at 1s." });
		expect(await updateSongChanges("a2", "s1", [])).toEqual({
			ok: false,
			error: "Song not found.",
		});
	});
});

describe("songGrid", () => {
	test("the frame rate and the bar grid of the song's changes from its start marker; null for a stranger", async () => {
		const changes: SongChange[] = [
			{ kind: "tempo", start: 0, value: "120" },
			{ kind: "meter", start: 0, value: "4/4" },
		];
		reset({ song: [{ ...s1, changes, startAt: 1.5, frameRate: 30 }] });
		expect(await songGrid("s1")).toEqual({ fps: 30, grid: barGrid(changes, 1.5) });
		expect(await songGrid("nope")).toBeNull();
	});
});
