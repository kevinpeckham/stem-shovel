import { MAX_STEMS_PER_SONG } from "#lib/constants/stemFormats.js";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { blob, callsTo, fake, reset } from "../../../tests/helpers/fakeDataLayer";

const {
	createStem,
	deleteStem,
	markStemReady,
	recordStemUrl,
	renameStem,
	reorderStems,
	reserveStemReplacement,
	setDefaultMix,
} = await import("./data");

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const at = (ms: number) => new Date(ms);
const s1 = {
	id: "s1",
	accountId: "a1",
	projectId: "p1",
	title: "One",
	slug: "one",
	durationSeconds: null,
	stemsUpdatedAt: null,
};
const file = { filename: "Bass DI.WAV", contentType: "audio/wav", sizeBytes: 1024 };
const ready = (id: string, over: Record<string, unknown> = {}) => ({
	id,
	accountId: "a1",
	songId: "s1",
	label: id,
	sortOrder: 0,
	gain: 1,
	status: "ready",
	url: `https://blob/${id}.wav`,
	pathname: `accounts/a1/songs/s1/${id}.wav`,
	filename: `${id}.wav`,
	contentType: "audio/wav",
	sizeBytes: 10,
	durationSeconds: 10,
	channels: 2,
	peaks: [0.1],
	playbackStatus: "ready",
	playbackUrl: `https://blob/${id}-play.m4a`,
	playbackPathname: `accounts/a1/songs/s1/${id}-play.m4a`,
	playbackBytes: 5,
	playbackStartedAt: at(1),
	midiUrl: null,
	createdAt: at(1),
	...over,
});
const songRow = () => fake.rows("song")[0];

beforeAll(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => reset({ song: [s1] }));

describe("createStem", () => {
	test("reserves an uploading row after the song's last stem, at a pathname of its own id and the file's extension", async () => {
		reset({ song: [s1], stem: [ready("st1", { sortOrder: 3 }), ready("st2", { sortOrder: 1 })] });
		const row = await createStem("a1", "u1", "s1", file);
		if (!row || row === "full") throw new Error("expected a row");
		expect(row.id).toMatch(/^[A-Za-z0-9_-]{21}$/);
		expect(row).toMatchObject({
			accountId: "a1",
			songId: "s1",
			label: "Bass DI",
			sortOrder: 4,
			status: "uploading",
			url: "",
			pathname: `accounts/a1/songs/s1/${row.id}.wav`,
			filename: "Bass DI.WAV",
			contentType: "audio/wav",
			sizeBytes: 1024,
			uploadedBy: "u1",
			durationSeconds: null,
			peaks: null,
		});
		expect(fake.rows("stem")).toHaveLength(3);
	});
	test("null for a song of another account; 'full' at MAX_STEMS_PER_SONG counting in-flight stems", async () => {
		expect(await createStem("a2", "u1", "s1", file)).toBeNull();
		const stems = Array.from({ length: MAX_STEMS_PER_SONG }, (_, i) =>
			ready(`st${i}`, { sortOrder: i, status: i % 2 ? "ready" : "uploading" }),
		);
		reset({ song: [s1], stem: stems });
		expect(await createStem("a1", "u1", "s1", file)).toBe("full");
		reset({ song: [s1], stem: stems.slice(1) });
		expect(await createStem("a1", "u1", "s1", file)).toMatchObject({ status: "uploading" });
		expect(callsTo("insert", "stem")).toHaveLength(1);
	});
});

describe("reserveStemReplacement", () => {
	test("keeps the row (id, label, order) and points it at the next -vN pathname, cleared and uploading; the old files go", async () => {
		reset({
			song: [{ ...s1, durationSeconds: 10 }],
			stem: [ready("st1", { label: "Bass", sortOrder: 2 })],
		});
		const row = await reserveStemReplacement("a1", "st1", {
			...file,
			filename: "bass take 2.flac",
		});
		expect(row).toMatchObject({
			id: "st1",
			label: "Bass",
			sortOrder: 2,
			status: "uploading",
			url: "",
			pathname: "accounts/a1/songs/s1/st1-v1.flac",
			filename: "bass take 2.flac",
			contentType: "audio/wav",
			sizeBytes: 1024,
			durationSeconds: null,
			channels: null,
			peaks: null,
			playbackStatus: null,
			playbackUrl: null,
			playbackPathname: null,
			playbackBytes: null,
			playbackStartedAt: null,
		});
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"https://blob/st1.wav",
			"https://blob/st1-play.m4a",
		]);
		// No ready stem is left, so the song has no length until the upload lands.
		expect(songRow().durationSeconds).toBeNull();
	});
	test("the version counts up from the pathname it replaces", async () => {
		reset({
			song: [s1],
			stem: [ready("st1", { pathname: "accounts/a1/songs/s1/st1-v7.wav", playbackUrl: null })],
		});
		const row = await reserveStemReplacement("a1", "st1", file);
		expect(row?.pathname).toBe("accounts/a1/songs/s1/st1-v8.wav");
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://blob/st1.wav", ""]);
	});
	test("another account's stem is null and keeps its files", async () => {
		reset({ song: [s1], stem: [ready("st1")] });
		expect(await reserveStemReplacement("a2", "st1", file)).toBeNull();
		expect(blob.deleteBlobs).not.toHaveBeenCalled();
		expect(fake.rows("stem")[0].status).toBe("ready");
	});
});

describe("markStemReady", () => {
	test("stores the URL and what the browser decoded, and the song's length becomes its longest ready stem", async () => {
		reset({
			song: [s1],
			stem: [
				ready("st1", { durationSeconds: 30 }),
				ready("st2", { status: "uploading", url: "", durationSeconds: null }),
			],
		});
		const decoded = {
			url: "https://blob/st2.wav",
			durationSeconds: 45.5,
			channels: 1,
			peaks: [0.2, 0.3],
		};
		expect(await markStemReady("a1", "st2", decoded)).toEqual({ songId: "s1" });
		expect(fake.rows("stem")[1]).toMatchObject({ status: "ready", ...decoded });
		expect(songRow()).toMatchObject({ durationSeconds: 45.5, stemsUpdatedAt: at(NOW) });
	});
	test("another account's stem is null and nothing is touched", async () => {
		reset({ song: [s1], stem: [ready("st1", { status: "uploading" })] });
		expect(
			await markStemReady("a2", "st1", { url: "x", durationSeconds: 1, channels: 1, peaks: [] }),
		).toBeNull();
		expect(fake.rows("stem")[0].status).toBe("uploading");
		expect(callsTo("update", "song")).toEqual([]);
	});
});

describe("setDefaultMix", () => {
	test("writes the gains of the song's own stems and stamps the song; ids from elsewhere are ignored", async () => {
		reset({
			song: [s1],
			stem: [ready("st1"), ready("st2"), ready("other", { songId: "s2" })],
		});
		expect(
			await setDefaultMix("a1", "s1", [
				{ id: "st1", gain: 0.5 },
				{ id: "other", gain: 0 },
				{ id: "nope", gain: 0 },
			]),
		).toBe(true);
		expect(fake.rows("stem").map((s) => s.gain)).toEqual([0.5, 1, 1]);
		expect(songRow().stemsUpdatedAt).toEqual(at(NOW));
	});
	test("false, with nothing written, when none of the ids are the song's", async () => {
		reset({ song: [s1], stem: [ready("st1")] });
		expect(await setDefaultMix("a2", "s1", [{ id: "st1", gain: 0 }])).toBe(false);
		expect(await setDefaultMix("a1", "s1", [])).toBe(false);
		expect(callsTo("update", "stem")).toEqual([]);
		expect(callsTo("update", "song")).toEqual([]);
	});
});

describe("recordStemUrl", () => {
	test("the webhook's URL lands on the uploading row at that pathname and marks it ready", async () => {
		reset({
			stem: [
				ready("st1", { status: "uploading", url: "" }),
				ready("st2", { pathname: "accounts/a1/songs/s1/st1.wav", status: "ready" }),
			],
		});
		await recordStemUrl("accounts/a1/songs/s1/st1.wav", "https://blob/new.wav");
		expect(fake.rows("stem").map((s) => [s.status, s.url])).toEqual([
			["ready", "https://blob/new.wav"],
			["ready", "https://blob/st2.wav"],
		]);
	});
});

describe("renameStem", () => {
	test("trims the label within the account", async () => {
		reset({ stem: [ready("st1")] });
		expect(await renameStem("a1", "st1", "  Lead Vox ")).toEqual({ id: "st1", label: "Lead Vox" });
		expect(await renameStem("a2", "st1", "x")).toBeNull();
		expect(fake.rows("stem")[0].label).toBe("Lead Vox");
	});
});

describe("reorderStems", () => {
	test("named stems first in that order, the rest after; only changed rows are written", async () => {
		reset({
			stem: [
				ready("st1", { sortOrder: 0 }),
				ready("st2", { sortOrder: 1 }),
				ready("st3", { sortOrder: 2 }),
				ready("other", { songId: "s2", sortOrder: 0 }),
			],
		});
		expect(await reorderStems("a1", "s1", ["st3", "other", "st1"])).toEqual(["st3", "st1", "st2"]);
		expect(callsTo("update", "stem").map((c) => c.values)).toEqual([
			{ sortOrder: 0 },
			{ sortOrder: 1 },
			{ sortOrder: 2 },
		]);
		expect(fake.rows("stem").map((s) => [s.id, s.sortOrder])).toEqual([
			["st1", 1],
			["st2", 2],
			["st3", 0],
			["other", 0],
		]);
		expect(await reorderStems("a2", "s1", ["st1"])).toEqual([]);
	});
});

describe("deleteStem", () => {
	test("removes the row, its files (source, rendition, MIDI) and recomputes the song's length", async () => {
		reset({
			song: [{ ...s1, durationSeconds: 60 }],
			stem: [
				ready("st1", { durationSeconds: 60, midiUrl: "https://blob/st1.mid" }),
				ready("st2", { durationSeconds: 20 }),
			],
		});
		expect(await deleteStem("a1", "st1")).toEqual({ songId: "s1" });
		expect(fake.rows("stem").map((s) => s.id)).toEqual(["st2"]);
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"https://blob/st1.wav",
			"https://blob/st1-play.m4a",
			"https://blob/st1.mid",
		]);
		expect(songRow()).toMatchObject({ durationSeconds: 20, stemsUpdatedAt: at(NOW) });
		expect(await deleteStem("a1", "st2")).toEqual({ songId: "s1" });
		expect(songRow().durationSeconds).toBeNull();
	});
	test("another account's stem is null and stays", async () => {
		reset({ song: [s1], stem: [ready("st1")] });
		expect(await deleteStem("a2", "st1")).toBeNull();
		expect(fake.rows("stem")).toHaveLength(1);
		expect(blob.deleteBlobs).not.toHaveBeenCalled();
	});
});
