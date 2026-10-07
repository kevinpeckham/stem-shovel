import { MAX_DEMOS_PER_SONG } from "$lib/constants/demoFormats";
import { MAX_STEMS_PER_SONG } from "$lib/constants/stemFormats";
import { hashMarkdown } from "$lib/server/markdown";
import type { IdeaInstruments, LooperSettings } from "$lib/val/IdeaSchema";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { blob, callsTo, cascade, fake, reset } from "../../../tests/helpers/fakeDataLayer";

// The cascade runs for real here: an idea's delete should leave no rows behind.
const realCascade =
	await vi.importActual<typeof import("$lib/server/cascade")>("$lib/server/cascade");
cascade.deleteIdeaRows.mockImplementation(realCascade.deleteIdeaRows);

const {
	claimRecordingPlayback,
	copyRecordingStemsToSong,
	copyRecordingToSong,
	createIdea,
	createRecording,
	createRecordingStem,
	deleteEmptyIdeas,
	deleteIdea,
	deleteIdeaIfEmpty,
	deleteRecording,
	failRecordingPlayback,
	finishRecordingPlayback,
	listUserIdeas,
	listUserLoops,
	loopSources,
	markRecordingReady,
	markRecordingStemReady,
	mergeIdeaNotesIntoSong,
	parseIdeaInstruments,
	recordRecordingUrl,
	recordingOfPathname,
	recordingStemById,
	recordingsWantingPlayback,
	renameIdea,
	renameRecording,
	replaceRecordingSource,
	setIdeaInstruments,
	setIdeaKind,
	setIdeaNotes,
	userOwnsIdea,
	userOwnsRecording,
} = await import("./data");

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const MINUTE = 60_000;
const at = (ms: number) => new Date(ms);
const row = (table: Parameters<typeof fake.rows>[0], id: string) =>
	fake.rows(table).find((r) => r.id === id);

const idea = { id: "i1", accountId: "a1", createdBy: "u1", kind: "idea", title: "Idea", notes: "" };
const looper: LooperSettings = { bpm: 120, beatsPerBar: 4, bars: 2, layers: [] };
const instruments = (settings: Partial<IdeaInstruments>) =>
	JSON.stringify({ drums: null, piano: null, looper: null, chords: null, ...settings });
/** A ready take of idea i1 in a1. */
const take = (id: string, takeNumber: number, extra: Record<string, unknown> = {}) => ({
	id,
	accountId: "a1",
	recordedBy: "u1",
	ideaId: "i1",
	takeNumber,
	title: "",
	notes: "",
	status: "ready",
	url: `https://b/${id}.wav`,
	pathname: `accounts/a1/recordings/${id}.wav`,
	filename: `${id}.wav`,
	contentType: "audio/wav",
	sizeBytes: 100,
	codec: "pcm",
	durationSeconds: 4,
	trimSilence: false,
	playbackStatus: null,
	playbackUrl: null,
	playbackPathname: null,
	playbackBytes: null,
	playbackStartedAt: null,
	createdAt: at(NOW - takeNumber * MINUTE),
	...extra,
});
/** A ready source of take r1 in a1. */
const source = (id: string, sortOrder: number, extra: Record<string, unknown> = {}) => ({
	id,
	accountId: "a1",
	recordingId: "r1",
	label: id.toUpperCase(),
	sortOrder,
	status: "ready",
	url: `https://b/${id}.wav`,
	pathname: `accounts/a1/recordings/r1/${id}.wav`,
	filename: `${id}.wav`,
	contentType: "audio/wav",
	sizeBytes: 10,
	codec: "pcm",
	durationSeconds: 3,
	...extra,
});
/** Song sg1 in a2 (another of the user's accounts), public, with its project. */
const songFixtures = (song: Record<string, unknown> = {}) => ({
	project: [{ id: "p1", accountId: "a2", slug: "p", isPrivate: false }],
	song: [
		{
			id: "sg1",
			accountId: "a2",
			projectId: "p1",
			title: "Song",
			slug: "song",
			isPrivate: false,
			status: "active",
			notesMarkdown: "",
			notesHash: null,
			notesVersion: 0,
			...song,
		},
	],
});

beforeAll(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => reset());

describe("createIdea", () => {
	test("trims the title, falls back to Untitled, and stores the kind", async () => {
		const made = await createIdea("a1", "u1", "  Riff  ");
		expect(made).toMatchObject({ accountId: "a1", createdBy: "u1", title: "Riff", kind: "idea" });
		expect(row("idea", made.id)).toMatchObject({ title: "Riff", notes: "" });
		expect((await createIdea("a1", "u1", "   ", "loop")).title).toBe("Untitled");
		expect((await createIdea("a1", "u1", "x", "loop")).kind).toBe("loop");
	});
});

describe("setIdeaKind / renameIdea / setIdeaNotes", () => {
	test("change the account's own idea and refuse another account's", async () => {
		reset({ idea: [idea, { ...idea, id: "i2", accountId: "a2" }] });
		expect(await setIdeaKind("a1", "i1", "loop")).toBe(true);
		expect(await renameIdea("a1", "i1", "Renamed")).toBe(true);
		expect(await setIdeaNotes("a1", "i1", "## notes")).toBe(true);
		expect(row("idea", "i1")).toMatchObject({ kind: "loop", title: "Renamed", notes: "## notes" });
		expect(await setIdeaKind("a1", "i2", "loop")).toBe(false);
		expect(await renameIdea("a1", "i2", "Renamed")).toBe(false);
		expect(await setIdeaNotes("a1", "i2", "x")).toBe(false);
		expect(row("idea", "i2")).toMatchObject({ kind: "idea", title: "Idea", notes: "" });
	});
});

describe("userOwnsIdea / userOwnsRecording", () => {
	test("an idea is its creator's within the account; a take is its idea's owner's", async () => {
		reset({
			idea: [idea, { ...idea, id: "i2", createdBy: "u2" }],
			recording: [take("r1", 1), take("r2", 1, { ideaId: "i2" }), take("r3", 1, { ideaId: null })],
		});
		expect(await userOwnsIdea("a1", "u1", "i1")).toBe(true);
		expect(await userOwnsIdea("a1", "u2", "i1")).toBe(false);
		expect(await userOwnsIdea("a2", "u1", "i1")).toBe(false);
		expect(await userOwnsRecording("a1", "u1", "r1")).toBe(true);
		expect(await userOwnsRecording("a1", "u1", "r2")).toBe(false);
		expect(await userOwnsRecording("a1", "u1", "r3")).toBe(false);
		expect(await userOwnsRecording("a2", "u1", "r1")).toBe(false);
	});
});

describe("listUserIdeas", () => {
	test("the user's ideas newest first with their kind, ready takes in take order, ready sources in sort order", async () => {
		reset({
			idea: [
				{ ...idea, createdAt: at(NOW - 2 * MINUTE) },
				{ ...idea, id: "i2", kind: "loop", createdAt: at(NOW - MINUTE) },
				{ ...idea, id: "i3", createdBy: "u2", createdAt: at(NOW) },
			],
			recording: [
				take("r1", 2, { playbackUrl: "https://b/r1.m4a" }),
				take("r2", 1),
				take("r3", 3, { status: "uploading" }),
				take("r4", 1, { ideaId: "i2" }),
			],
			recordingStem: [source("s1", 1), source("s2", 0), source("s3", 2, { status: "uploading" })],
		});
		const ideas = await listUserIdeas("u1");
		expect(ideas.map((i) => [i.id, i.kind, i.takes.map((t) => t.id)])).toEqual([
			["i2", "loop", ["r4"]],
			["i1", "idea", ["r2", "r1"]],
		]);
		expect(ideas[1].takes[0].stems).toEqual([]);
		expect(ideas[1].takes[1].stems).toEqual([
			{ id: "s2", label: "S2" },
			{ id: "s1", label: "S1" },
		]);
		expect(ideas[1].takes[1]).toMatchObject({
			url: "https://b/r1.wav",
			playbackUrl: "https://b/r1.m4a",
			codec: "pcm",
		});
		expect(blob.presentUrl).toHaveBeenCalledWith("https://b/r1.m4a");
	});
});

describe("setIdeaInstruments", () => {
	test("merges an instrument at a time: a null keeps what the idea holds", async () => {
		reset({ idea: [{ ...idea, instruments: instruments({ looper }) }] });
		const chords = null;
		const next = await setIdeaInstruments("a1", "i1", {
			drums: null,
			piano: null,
			looper: null,
			chords,
		});
		expect(next).toEqual({ drums: null, piano: null, looper, chords: null });
		const replaced = { ...looper, bpm: 90 };
		expect(
			await setIdeaInstruments("a1", "i1", { drums: null, piano: null, looper: replaced, chords }),
		).toEqual({ drums: null, piano: null, looper: replaced, chords: null });
		expect(JSON.parse(row("idea", "i1")?.instruments as string)).toEqual({
			drums: null,
			piano: null,
			looper: replaced,
			chords: null,
		});
	});
	test("null for an idea the account does not hold, with nothing written", async () => {
		reset({ idea: [{ ...idea, accountId: "a2" }] });
		expect(
			await setIdeaInstruments("a1", "i1", { drums: null, piano: null, looper, chords: null }),
		).toBeNull();
		expect(callsTo("update", "idea")).toEqual([]);
	});
});

describe("parseIdeaInstruments", () => {
	test("null for nothing, bad JSON or a shape off the schema; the settings otherwise", () => {
		expect(parseIdeaInstruments(null)).toBeNull();
		expect(parseIdeaInstruments("{not json")).toBeNull();
		expect(parseIdeaInstruments(JSON.stringify({ drums: "no" }))).toBeNull();
		expect(parseIdeaInstruments(instruments({ looper }))).toEqual({
			drums: null,
			piano: null,
			looper,
			chords: null,
		});
	});
});

describe("listUserLoops", () => {
	test("one loop per idea that came from the looper and has a ready take, newest first, with its ready layers", async () => {
		reset({
			idea: [
				{
					...idea,
					kind: "loop",
					title: "Loop A",
					instruments: instruments({ looper }),
					createdAt: at(NOW - MINUTE),
				},
				{
					...idea,
					id: "i2",
					title: "No take",
					instruments: instruments({ looper }),
					createdAt: at(NOW),
				},
				{
					...idea,
					id: "i3",
					title: "From the recorder",
					instruments: instruments({}),
					createdAt: at(NOW),
				},
				{
					...idea,
					id: "i4",
					createdBy: "u2",
					instruments: instruments({ looper }),
					createdAt: at(NOW),
				},
			],
			recording: [take("r1", 1), take("r2", 1, { ideaId: "i4" })],
			recordingStem: [source("s1", 1), source("s2", 0), source("s3", 2, { status: "uploading" })],
		});
		expect(await listUserLoops("u1")).toEqual([
			{
				id: "r1",
				ideaId: "i1",
				kind: "loop",
				title: "Loop A",
				createdAt: at(NOW - MINUTE),
				layers: 2,
				bpm: 120,
				bars: 2,
			},
		]);
	});
});

describe("loopSources", () => {
	test("the take as a mix, its ready sources in order and the loop's settings; null for another account", async () => {
		reset({
			idea: [{ ...idea, notes: "n", instruments: instruments({ looper }) }],
			recording: [take("r1", 2, { durationSeconds: 8 })],
			recordingStem: [source("s1", 1), source("s2", 0), source("s3", 2, { status: "uploading" })],
		});
		expect(await loopSources("a1", "r1")).toEqual({
			settings: looper,
			idea: { id: "i1", kind: "idea", title: "Idea", notes: "n" },
			mix: { url: "https://b/r1.wav", durationSeconds: 8, title: "Take 2" },
			sources: [
				{ label: "S2", sortOrder: 0, url: "https://b/s2.wav" },
				{ label: "S1", sortOrder: 1, url: "https://b/s1.wav" },
			],
		});
		expect(await loopSources("a2", "r1")).toBeNull();
	});
});

describe("deleteIdeaIfEmpty", () => {
	test("keeps an idea with notes, a take, a source or a revision; removes an empty one", async () => {
		reset({
			idea: [
				idea,
				{ ...idea, id: "i2", notes: "keep" },
				{ ...idea, id: "i3" },
				{ ...idea, id: "i4" },
				{ ...idea, id: "i5" },
			],
			recording: [take("r1", 1, { ideaId: "i3" })],
			studioSource: [{ id: "ss1", accountId: "a1", ideaId: "i4", url: "https://b/ss1.wav" }],
			studioRevision: [{ id: "v1", accountId: "a1", ideaId: "i5", number: 1 }],
		});
		expect(await deleteIdeaIfEmpty("a1", "i2")).toBe(false);
		expect(await deleteIdeaIfEmpty("a1", "i3")).toBe(false);
		expect(await deleteIdeaIfEmpty("a1", "i4")).toBe(false);
		expect(await deleteIdeaIfEmpty("a1", "i5")).toBe(false);
		expect(await deleteIdeaIfEmpty("a1", "nope")).toBe(false);
		expect(fake.rows("idea")).toHaveLength(5);
		expect(await deleteIdeaIfEmpty("a1", "i1")).toBe(true);
		expect(fake.rows("idea").map((r) => r.id)).toEqual(["i2", "i3", "i4", "i5"]);
	});
});

describe("deleteEmptyIdeas", () => {
	test("sweeps the user's ideas older than the grace window with no take, notes, source or revision", async () => {
		const old = at(NOW - 2 * MINUTE);
		reset({
			idea: [
				{ ...idea, id: "stale", createdAt: old },
				{ ...idea, id: "blank-notes", notes: "  \n", createdAt: old },
				{ ...idea, id: "fresh", createdAt: at(NOW - 10_000) },
				{ ...idea, id: "with-take", createdAt: old },
				{ ...idea, id: "with-notes", notes: "x", createdAt: old },
				{ ...idea, id: "with-source", createdAt: old },
				{ ...idea, id: "with-revision", createdAt: old },
				{ ...idea, id: "someone-elses", createdBy: "u2", createdAt: old },
			],
			recording: [take("r1", 1, { ideaId: "with-take" })],
			studioSource: [{ id: "ss1", accountId: "a1", ideaId: "with-source", url: "" }],
			studioRevision: [{ id: "v1", accountId: "a1", ideaId: "with-revision", number: 1 }],
		});
		expect(await deleteEmptyIdeas("u1", MINUTE)).toBe(2);
		expect(fake.rows("idea").map((r) => r.id)).toEqual([
			"fresh",
			"with-take",
			"with-notes",
			"with-source",
			"with-revision",
			"someone-elses",
		]);
	});
});

describe("deleteIdea", () => {
	test("removes the idea with its takes, sources and Studio files, every file collected for deletion", async () => {
		reset({
			idea: [idea, { ...idea, id: "i2" }],
			recording: [
				take("r1", 1, { playbackUrl: "https://b/r1.m4a" }),
				take("r2", 2),
				take("r3", 1, { ideaId: "i2" }),
			],
			recordingStem: [source("s1", 0), source("s2", 0, { recordingId: "r3" })],
			studioSource: [
				{ id: "ss1", accountId: "a1", ideaId: "i1", url: "https://b/ss1.wav" },
				{ id: "ss2", accountId: "a1", ideaId: "i2", url: "https://b/ss2.wav" },
			],
			studioRevision: [{ id: "v1", accountId: "a1", ideaId: "i1", number: 1 }],
		});
		expect(await deleteIdea("a1", "i1")).toBe(true);
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"https://b/r1.wav",
			"https://b/r1.m4a",
			"https://b/r2.wav",
			"",
			"https://b/s1.wav",
			"https://b/ss1.wav",
		]);
		expect(fake.rows("idea").map((r) => r.id)).toEqual(["i2"]);
		expect(fake.rows("recording").map((r) => r.id)).toEqual(["r3"]);
		expect(fake.rows("recordingStem").map((r) => r.id)).toEqual(["s2"]);
		expect(fake.rows("studioSource").map((r) => r.id)).toEqual(["ss2"]);
		expect(fake.rows("studioRevision")).toEqual([]);
	});
	test("false for another account's idea, with nothing removed", async () => {
		reset({
			idea: [{ ...idea, accountId: "a2" }],
			recording: [take("r1", 1, { accountId: "a2" })],
		});
		expect(await deleteIdea("a1", "i1")).toBe(false);
		expect(blob.deleteBlobs).not.toHaveBeenCalled();
		expect(fake.rows("idea")).toHaveLength(1);
		expect(fake.rows("recording")).toHaveLength(1);
	});
});

describe("createRecording", () => {
	const file = {
		filename: "take.wav",
		contentType: "audio/wav",
		sizeBytes: 100,
		title: "First",
		codec: "pcm",
		trimSilence: true,
	};
	test("numbers the take after the idea's last and reserves its pathname", async () => {
		reset({ idea: [idea], recording: [take("r1", 1), take("r2", 3)] });
		const made = await createRecording("a1", "u1", "i1", file);
		expect(made).toMatchObject({
			accountId: "a1",
			recordedBy: "u1",
			ideaId: "i1",
			takeNumber: 4,
			title: "First",
			url: "",
			pathname: `accounts/a1/recordings/${made?.id}.wav`,
			status: "uploading",
			codec: "pcm",
			trimSilence: true,
		});
		expect(fake.rows("recording")).toHaveLength(3);
	});
	test("the first take is number 1; null for an idea the account lacks", async () => {
		reset({ idea: [idea, { ...idea, id: "i2", accountId: "a2" }] });
		expect((await createRecording("a1", "u1", "i1", file))?.takeNumber).toBe(1);
		expect(await createRecording("a1", "u1", "i2", file)).toBeNull();
		expect(fake.rows("recording")).toHaveLength(1);
	});
});

describe("recordingOfPathname", () => {
	test("finds a take, or the take a source belongs to; null otherwise", async () => {
		reset({ recording: [take("r1", 1)], recordingStem: [source("s1", 0)] });
		expect(await recordingOfPathname("accounts/a1/recordings/r1.wav")).toEqual({
			id: "r1",
			accountId: "a1",
		});
		expect(await recordingOfPathname("accounts/a1/recordings/r1/s1.wav")).toEqual({
			id: "r1",
			accountId: "a1",
		});
		expect(await recordingOfPathname("accounts/a1/recordings/zz.wav")).toBeNull();
	});
});

describe("createRecordingStem / markRecordingStemReady / recordingStemById", () => {
	const file = {
		filename: "gtr.flac",
		contentType: "audio/flac",
		sizeBytes: 10,
		label: "Gtr",
		sortOrder: 2,
		codec: "flac",
	};
	test("reserves a source under the take, marks it ready, and names its take", async () => {
		reset({ recording: [take("r1", 1)] });
		const made = await createRecordingStem("a1", "r1", file);
		expect(made).toMatchObject({
			accountId: "a1",
			recordingId: "r1",
			label: "Gtr",
			sortOrder: 2,
			status: "uploading",
			url: "",
			pathname: `accounts/a1/recordings/r1/${made?.id}.flac`,
			codec: "flac",
		});
		const id = made?.id as string;
		expect(await markRecordingStemReady("a1", id, "https://b/gtr.flac", 3.5)).toEqual({
			id,
			recordingId: "r1",
		});
		expect(row("recordingStem", id)).toMatchObject({
			status: "ready",
			url: "https://b/gtr.flac",
			durationSeconds: 3.5,
		});
		expect(await recordingStemById(id)).toEqual({ accountId: "a1", recordingId: "r1" });
		expect(await recordingStemById("nope")).toBeNull();
	});
	test("null for a take of another account, in reserving and in marking ready", async () => {
		reset({
			recording: [take("r1", 1, { accountId: "a2" })],
			recordingStem: [source("s1", 0, { accountId: "a2" })],
		});
		expect(await createRecordingStem("a1", "r1", file)).toBeNull();
		expect(await markRecordingStemReady("a1", "s1", "https://b/x", null)).toBeNull();
		expect(row("recordingStem", "s1")?.status).toBe("ready");
	});
});

describe("copyRecordingStemsToSong", () => {
	const existingStem = (id: string, sortOrder: number) => ({
		id,
		accountId: "a2",
		songId: "sg1",
		sortOrder,
		status: "ready",
		url: `https://b/${id}.wav`,
		pathname: `accounts/a2/songs/sg1/${id}.wav`,
		durationSeconds: 2,
	});
	test("copies each ready source under the song as a ready stem after the song's last, and refreshes the song", async () => {
		reset({
			...songFixtures(),
			recording: [take("r1", 1)],
			recordingStem: [
				source("s1", 1, { durationSeconds: 3 }),
				source("s2", 0, { durationSeconds: 5 }),
				source("s3", 2, { status: "uploading" }),
			],
			stem: [existingStem("st0", 4)],
		});
		const ids = await copyRecordingStemsToSong("a1", "u1", "r1", "sg1");
		expect(Array.isArray(ids) && ids.length).toBe(2);
		const [first, second] = ids as string[];
		expect(row("stem", first)).toMatchObject({
			accountId: "a2",
			songId: "sg1",
			label: "S2",
			sortOrder: 5,
			status: "ready",
			pathname: `accounts/a2/songs/sg1/${first}.wav`,
			url: `https://blob/accounts/a2/songs/sg1/${first}.wav`,
			filename: "s2.wav",
			sizeBytes: 10,
			durationSeconds: 5,
			uploadedBy: "u1",
		});
		expect(row("stem", second)).toMatchObject({ label: "S1", sortOrder: 6 });
		expect(blob.copyBlob).toHaveBeenCalledWith(
			"https://b/s2.wav",
			`accounts/a2/songs/sg1/${first}.wav`,
			"public",
		);
		expect(row("song", "sg1")).toMatchObject({ durationSeconds: 5, stemsUpdatedAt: at(NOW) });
	});
	test("null without the take or the song, none without ready sources, full past the cap", async () => {
		reset({
			...songFixtures(),
			recording: [take("r1", 1), take("r2", 2)],
			recordingStem: [source("s1", 0), source("s2", 1)],
			stem: Array.from({ length: MAX_STEMS_PER_SONG - 1 }, (_, i) => existingStem(`st${i}`, i)),
		});
		expect(await copyRecordingStemsToSong("a1", "u1", "nope", "sg1")).toBeNull();
		expect(await copyRecordingStemsToSong("a1", "u1", "r1", "nope")).toBeNull();
		expect(await copyRecordingStemsToSong("a1", "u1", "r2", "sg1")).toBe("none");
		expect(await copyRecordingStemsToSong("a1", "u1", "r1", "sg1")).toBe("full");
		expect(callsTo("insert", "stem")).toEqual([]);
	});
});

describe("markRecordingReady / recordRecordingUrl / renameRecording", () => {
	test("the browser's report readies the account's own take", async () => {
		reset({
			recording: [
				take("r1", 1, { status: "uploading", url: "" }),
				take("r2", 1, { accountId: "a2", status: "uploading" }),
			],
		});
		expect(await markRecordingReady("a1", "r1", "https://b/r1.wav", 6)).toEqual({ id: "r1" });
		expect(row("recording", "r1")).toMatchObject({
			status: "ready",
			url: "https://b/r1.wav",
			durationSeconds: 6,
		});
		expect(await markRecordingReady("a1", "r2", "https://b/r2.wav", 6)).toBeNull();
		expect(await renameRecording("a1", "r1", "Chorus")).toBe(true);
		expect(row("recording", "r1")?.title).toBe("Chorus");
		expect(await renameRecording("a1", "r2", "Chorus")).toBe(false);
	});
	test("the webhook backstop readies the uploading row with that pathname, a take or a source, and no other", async () => {
		reset({
			recording: [
				take("r1", 1, { status: "uploading", url: "" }),
				take("r2", 2, { url: "https://b/keep.wav" }),
			],
			recordingStem: [source("s1", 0, { status: "uploading", url: "" })],
		});
		await recordRecordingUrl("accounts/a1/recordings/r1.wav", "https://b/new.wav");
		await recordRecordingUrl("accounts/a1/recordings/r2.wav", "https://b/late.wav");
		await recordRecordingUrl("accounts/a1/recordings/r1/s1.wav", "https://b/src.wav");
		expect(row("recording", "r1")).toMatchObject({ status: "ready", url: "https://b/new.wav" });
		expect(row("recording", "r2")?.url).toBe("https://b/keep.wav");
		expect(row("recordingStem", "s1")).toMatchObject({ status: "ready", url: "https://b/src.wav" });
	});
});

describe("deleteRecording", () => {
	test("removes the take and its sources, files included, and names its idea", async () => {
		reset({
			recording: [take("r1", 1, { playbackUrl: "https://b/r1.m4a" }), take("r2", 2)],
			recordingStem: [source("s1", 0), source("s2", 0, { recordingId: "r2" })],
		});
		expect(await deleteRecording("a1", "r1")).toEqual({ ideaId: "i1" });
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"https://b/r1.wav",
			"https://b/r1.m4a",
			"https://b/s1.wav",
		]);
		expect(fake.rows("recording").map((r) => r.id)).toEqual(["r2"]);
		expect(fake.rows("recordingStem").map((r) => r.id)).toEqual(["s2"]);
	});
	test("null for another account's take, nothing removed", async () => {
		reset({
			recording: [take("r1", 1, { accountId: "a2" })],
			recordingStem: [source("s1", 0, { accountId: "a2" })],
		});
		expect(await deleteRecording("a1", "r1")).toBeNull();
		expect(blob.deleteBlobs).not.toHaveBeenCalled();
		expect(fake.rows("recordingStem")).toHaveLength(1);
	});
});

describe("copyRecordingToSong", () => {
	test("files the take under the song's account as a ready demo; a rendered MP3 comes along", async () => {
		reset({
			...songFixtures(),
			recording: [
				take("r1", 1, {
					title: "Verse",
					playbackStatus: "ready",
					playbackUrl: "https://b/r1.mp3",
					playbackPathname: "accounts/a1/recordings/r1.play.mp3",
					playbackBytes: 40,
				}),
				take("r2", 2),
			],
		});
		const made = await copyRecordingToSong("a1", "u1", "r1", "sg1");
		const id = (made as { id: string }).id;
		const pathname = `accounts/a2/songs/sg1/demos/${id}.wav`;
		const playbackPathname = `accounts/a2/songs/sg1/demos/${id}.play-${NOW.toString(36)}.mp3`;
		expect(row("demo", id)).toMatchObject({
			accountId: "a2",
			songId: "sg1",
			label: "Verse",
			status: "ready",
			url: `https://blob/${pathname}`,
			pathname,
			filename: "r1.wav",
			contentType: "audio/wav",
			sizeBytes: 100,
			uploadedBy: "u1",
			playbackStatus: "ready",
			playbackUrl: `https://blob/${playbackPathname}`,
			playbackPathname,
			playbackBytes: 40,
			playbackStartedAt: at(NOW),
		});
		expect(blob.copyBlob).toHaveBeenCalledWith("https://b/r1.wav", pathname, "public");
		expect(blob.copyBlob).toHaveBeenCalledWith("https://b/r1.mp3", playbackPathname, "public");
		const plain = await copyRecordingToSong("a1", "u1", "r2", "sg1");
		expect(row("demo", (plain as { id: string }).id)).toMatchObject({
			playbackStatus: null,
			playbackUrl: null,
		});
		expect(blob.copyBlob).toHaveBeenCalledTimes(3);
	});
	test("null for a take that is not ready or a song that does not exist; full at the demos cap", async () => {
		reset({
			...songFixtures(),
			recording: [take("r1", 1), take("r2", 2, { status: "uploading" })],
			demo: Array.from({ length: MAX_DEMOS_PER_SONG }, (_, i) => ({
				id: `d${i}`,
				accountId: "a2",
				songId: "sg1",
			})),
		});
		expect(await copyRecordingToSong("a1", "u1", "r2", "sg1")).toBeNull();
		expect(await copyRecordingToSong("a1", "u1", "r1", "nope")).toBeNull();
		expect(await copyRecordingToSong("a1", "u1", "r1", "sg1")).toBe("full");
		expect(blob.copyBlob).not.toHaveBeenCalled();
	});
});

describe("mergeIdeaNotesIntoSong", () => {
	test("appends the idea's notes under a heading naming the idea and take, as a new version of the song's notes", async () => {
		reset({
			...songFixtures({ notesMarkdown: "Existing\n\n", notesVersion: 2 }),
			idea: [{ ...idea, title: "My idea", notes: "  Some notes  " }],
			recording: [take("r1", 2, { title: "Verse" })],
		});
		expect(await mergeIdeaNotesIntoSong("a1", "u1", "sg1", "r1")).toBe(true);
		const merged = "Existing\n\n## My idea · Take 2 · Verse\n\nSome notes\n";
		expect(row("song", "sg1")).toMatchObject({
			notesMarkdown: merged,
			notesVersion: 3,
			notesHash: await hashMarkdown(merged),
		});
		expect(callsTo("insert", "song_doc_version")[0].values).toMatchObject({
			songId: "sg1",
			kind: "notes",
			userId: null,
			versionNumber: 3,
			markdown: merged,
			createdBy: "u1",
		});
	});
	test("the whole document when the song had none; nothing for empty idea notes or an unknown song", async () => {
		reset({
			...songFixtures(),
			idea: [idea, { ...idea, id: "i2", notes: "Notes" }],
			recording: [take("r1", 1), take("r2", 1, { ideaId: "i2" })],
		});
		expect(await mergeIdeaNotesIntoSong("a1", "u1", "sg1", "r1")).toBe(false);
		expect(await mergeIdeaNotesIntoSong("a1", "u1", "nope", "r2")).toBe(false);
		expect(callsTo("update", "song")).toEqual([]);
		expect(await mergeIdeaNotesIntoSong("a1", "u1", "sg1", "r2")).toBe(true);
		expect(row("song", "sg1")?.notesMarkdown).toBe("Notes\n");
	});
});

describe("claimRecordingPlayback and the rendition's outcome", () => {
	test("the claim is the lock: a second claim on the pending row is null; a failed row is retried after an hour, a stuck one after fifteen minutes", async () => {
		reset({
			recording: [
				take("r1", 1),
				take("r2", 2, { status: "uploading" }),
				take("r3", 3, { playbackStatus: "failed", playbackStartedAt: at(NOW - 61 * MINUTE) }),
				take("r4", 4, { playbackStatus: "failed", playbackStartedAt: at(NOW - 59 * MINUTE) }),
				take("r5", 5, { playbackStatus: "pending", playbackStartedAt: at(NOW - 16 * MINUTE) }),
				take("r6", 6, { playbackStatus: "ready" }),
			],
		});
		expect(await claimRecordingPlayback("r1")).toEqual({
			id: "r1",
			url: "https://b/r1.wav",
			pathname: "accounts/a1/recordings/r1.wav",
			playbackUrl: null,
			contentType: "audio/wav",
			codec: "pcm",
			trimSilence: false,
		});
		expect(row("recording", "r1")).toMatchObject({
			playbackStatus: "pending",
			playbackStartedAt: at(NOW),
		});
		expect(await claimRecordingPlayback("r1")).toBeNull();
		expect(await claimRecordingPlayback("r2")).toBeNull();
		expect((await claimRecordingPlayback("r3"))?.id).toBe("r3");
		expect(await claimRecordingPlayback("r4")).toBeNull();
		expect((await claimRecordingPlayback("r5"))?.id).toBe("r5");
		expect(await claimRecordingPlayback("r6")).toBeNull();
	});
	test("finishing records the rendition, failing marks it, replacing swaps the source and clears the trim", async () => {
		reset({ recording: [take("r1", 1, { trimSilence: true, durationSeconds: 4 })] });
		await finishRecordingPlayback("r1", {
			url: "https://b/r1.mp3",
			pathname: "p/r1.mp3",
			bytes: 7,
		});
		expect(row("recording", "r1")).toMatchObject({
			playbackStatus: "ready",
			playbackUrl: "https://b/r1.mp3",
			playbackPathname: "p/r1.mp3",
			playbackBytes: 7,
		});
		await failRecordingPlayback("r1");
		expect(row("recording", "r1")?.playbackStatus).toBe("failed");
		const swapped = {
			url: "https://b/r1.flac",
			pathname: "p/r1.flac",
			filename: "r1.flac",
			contentType: "audio/flac",
			sizeBytes: 50,
			codec: "flac",
		};
		await replaceRecordingSource("r1", swapped);
		expect(row("recording", "r1")).toMatchObject({
			...swapped,
			trimSilence: false,
			durationSeconds: 4,
		});
		await replaceRecordingSource("r1", { ...swapped, durationSeconds: 3.5 });
		expect(row("recording", "r1")?.durationSeconds).toBe(3.5);
	});
});

describe("recordingsWantingPlayback", () => {
	test("ready takes with a file that never got a rendition, failed over an hour ago, or stuck pending", () => {
		const r = (
			id: string,
			playbackStatus: "ready" | "pending" | "failed" | null,
			minutesAgo = 0,
			status = "ready",
		) => ({
			id,
			status,
			url: "https://b/x",
			playbackStatus,
			playbackStartedAt: playbackStatus ? at(NOW - minutesAgo * MINUTE) : null,
		});
		expect(
			recordingsWantingPlayback(
				[
					r("fresh", null),
					r("uploading", null, 0, "uploading"),
					r("done", "ready"),
					r("old-fail", "failed", 61),
					r("new-fail", "failed", 59),
					r("stuck", "pending", 16),
					r("busy", "pending", 14),
					{ ...r("no-file", null), url: "" },
				],
				NOW,
			),
		).toEqual(["fresh", "old-fail", "stuck"]);
	});
});
