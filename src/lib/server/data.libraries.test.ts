import { MAX_DRUM_KITS_PER_ACCOUNT } from "#lib/constants/drumKits.js";
import type { ChordStyleData } from "#lib/val/ChordStyleSchema.js";
import type { DrumProject } from "#lib/val/DrumPatternSchema.js";
import { NamedPianoPresetSchema, type PianoPresetData } from "#lib/val/PianoPresetSchema.js";
import type { ProgressionData } from "#lib/val/ProgressionSchema.js";
import * as v from "valibot";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

// data.ts reaches the database and Blob; both are stubbed. `presentUrl`
// signs visibly, so a test can tell a presented URL from a raw one.
const { fake, blob } = await vi.hoisted(async () => ({
	fake: (await import("../../../tests/helpers/fakeDb")).fakeDb(),
	blob: {
		presentUrl: vi.fn(async (url: string | null | undefined) => (url ? `signed:${url}` : null)),
		deleteBlobs: vi.fn(async () => {}),
		recordingAccess: vi.fn(() => "private" as const),
		drumSamplePathname: (
			accountId: string | null,
			kitId: string,
			sampleId: string,
			filename: string,
		) =>
			`${accountId ? `accounts/${accountId}` : "site"}/kits/${kitId}/${sampleId}.${(filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? "bin").toLowerCase()}`,
	},
}));
vi.mock("#lib/server/db/index.js", async () => ({
	db: fake,
	schema: await import("#lib/server/db/schema/index.js"),
}));
vi.mock("#lib/server/blob.js", () => blob);

const {
	accountOfDrumKit,
	accountOfDrumSamplePathname,
	countPianoPresets,
	createBeat,
	createChordStyle,
	createDrumKit,
	createDrumSample,
	createPianoPreset,
	createProgression,
	deleteAccountDrumKits,
	deleteBeat,
	deleteChordStyle,
	deleteDrumKit,
	deleteDrumSample,
	deletePianoPreset,
	deleteProgression,
	deleteProgressionIfEmpty,
	drumSampleOwner,
	ensureBuiltinKitRow,
	listBeats,
	listChordStyles,
	listDrumKitManifests,
	listDrumKitsFor,
	listPianoPresets,
	listProgressions,
	markDrumSampleReady,
	recordDrumSampleUrl,
	renameBeat,
	renameChordStyle,
	renameDrumKit,
	renamePianoPreset,
	renameProgression,
	setDrumSampleSource,
	setPianoPresetSlot,
	setProgressionNotes,
	setSitePianoPreset,
	sitePianoPresets,
	songForBeat,
	updateBeat,
	updateChordStyle,
	updatePianoPreset,
	updateProgression,
} = await import("./data");

const at = (minute: number) => new Date(Date.UTC(2026, 9, 7, 12, minute));
const kit = (id: string, accountId: string | null, name: string, minute: number) => ({
	id,
	accountId,
	createdBy: "u1",
	name,
	createdAt: at(minute),
	updatedAt: at(minute),
});
const sample = (
	id: string,
	kitId: string,
	accountId: string | null,
	voice: string,
	status: string,
	minute: number,
) => ({
	id,
	kitId,
	accountId,
	voice,
	status,
	url: `https://blob/${id}.wav`,
	pathname: `${accountId ? `accounts/${accountId}` : "site"}/kits/${kitId}/${id}.wav`,
	filename: `${id}.wav`,
	contentType: "audio/wav",
	sizeBytes: 100,
	uploadedBy: "u1",
	source: "",
	createdAt: at(minute),
	updatedAt: at(minute),
});
const kits = {
	user: [{ id: "u1", name: "Kev", email: "kev@example.com" }],
	drumKit: [
		kit("s1", null, "Site", 0),
		kit("k1", "a1", "Mine", 1),
		kit("acoustic", null, "Acoustic", 2),
		kit("k2", "a2", "Theirs", 3),
	],
	drumSample: [
		sample("sm1", "s1", null, "kick", "ready", 1),
		sample("sm2", "k1", "a1", "kick", "ready", 1),
		sample("sm3", "k1", "a1", "kick", "ready", 2),
		sample("sm4", "k1", "a1", "snare", "uploading", 3),
		sample("sm5", "k1", "a1", "clap", "failed", 4),
		sample("sm6", "acoustic", null, "snare", "ready", 1),
		sample("sm7", "k2", "a2", "kick", "ready", 1),
		sample("sm8", "k1", "a1", "kick", "uploading", 5),
	],
};
const ops = (op: string, table: string) =>
	fake.calls.filter((c) => c.op === op && c.table === table);
const ids = (rows: { id?: unknown }[]) => rows.map((r) => r.id);

beforeEach(() => {
	fake.reset(kits);
	blob.deleteBlobs.mockClear();
	blob.presentUrl.mockClear();
});

describe("accountOfDrumKit / accountOfDrumSamplePathname", () => {
	it("names the kit's account, null for a site kit, null for no kit", async () => {
		expect(await accountOfDrumKit("k1")).toEqual({ accountId: "a1" });
		expect(await accountOfDrumKit("s1")).toEqual({ accountId: null });
		expect(await accountOfDrumKit("nope")).toBeNull();
	});
	it("finds the sample's account by pathname", async () => {
		expect(await accountOfDrumSamplePathname("accounts/a1/kits/k1/sm3.wav")).toBe("a1");
		expect(await accountOfDrumSamplePathname("site/kits/s1/sm1.wav")).toBeNull();
		expect(await accountOfDrumSamplePathname("nope")).toBeNull();
	});
});

describe("listDrumKitManifests", () => {
	it("the site's kits first, then the account's; the newest ready file per voice, presented for the account", async () => {
		expect(await listDrumKitManifests("a1")).toEqual([
			{ id: "s1", name: "Site", scope: "site", samples: { kick: "https://blob/sm1.wav" } },
			{
				id: "acoustic",
				name: "Acoustic",
				scope: "site",
				samples: { snare: "https://blob/sm6.wav" },
			},
			{
				id: "k1",
				name: "Mine",
				scope: "account",
				samples: { kick: "signed:https://blob/sm3.wav" },
			},
		]);
		expect(blob.presentUrl).toHaveBeenCalledTimes(1);
	});
	it("signed out: the site's only", async () => {
		expect(ids(await listDrumKitManifests(null))).toEqual(["s1", "acoustic"]);
	});
});

describe("ensureBuiltinKitRow", () => {
	it("null for a kit that is not overridable", async () => {
		expect(await ensureBuiltinKitRow("electronic")).toBeNull();
		expect(ops("insert", "drum_kit")).toEqual([]);
	});
	it("the existing row, with nothing written", async () => {
		expect(await ensureBuiltinKitRow("acoustic")).toEqual({ id: "acoustic" });
		expect(ops("insert", "drum_kit")).toEqual([]);
	});
	it("makes the row under the kit's own id and label", async () => {
		expect(await ensureBuiltinKitRow("room")).toEqual({ id: "room" });
		expect(ops("insert", "drum_kit")[0].values).toEqual({
			id: "room",
			accountId: null,
			name: "Room",
		});
	});
});

describe("listDrumKitsFor", () => {
	it("an account's kits with every sample but the failed ones, newest first, presented, with the uploader's name", async () => {
		const [k, ...rest] = await listDrumKitsFor("a1");
		expect(rest).toEqual([]);
		expect([k.id, k.scope, k.builtin]).toEqual(["k1", "account", false]);
		expect(k.samples.map((s) => [s.id, s.status, s.url, s.uploadedBy])).toEqual([
			["sm8", "uploading", "signed:https://blob/sm8.wav", "Kev"],
			["sm4", "uploading", "signed:https://blob/sm4.wav", "Kev"],
			["sm3", "ready", "signed:https://blob/sm3.wav", "Kev"],
			["sm2", "ready", "signed:https://blob/sm2.wav", "Kev"],
		]);
	});
	it("the site's: the two built-ins first (an empty one for a kit with no row yet), then the rest, raw URLs", async () => {
		const listed = await listDrumKitsFor(null);
		expect(listed.map((k) => [k.id, k.name, k.builtin, k.samples.map((s) => s.url)])).toEqual([
			["acoustic", "Acoustic", true, ["https://blob/sm6.wav"]],
			["room", "Room", true, []],
			["s1", "Site", false, ["https://blob/sm1.wav"]],
		]);
		expect(blob.presentUrl).not.toHaveBeenCalled();
	});
});

describe("createDrumKit", () => {
	it("an account's kit, the name trimmed", async () => {
		const row = await createDrumKit("a1", "u1", "  Lo-fi  ");
		expect(row).toMatchObject({ accountId: "a1", createdBy: "u1", name: "Lo-fi" });
		expect(fake.rows("drumKit")).toHaveLength(5);
	});
	it("'full' at the account's cap, with nothing written", async () => {
		fake.reset({
			drumKit: Array.from({ length: MAX_DRUM_KITS_PER_ACCOUNT }, (_, i) =>
				kit(`k${i}`, "a1", `Kit ${i}`, i),
			),
		});
		expect(await createDrumKit("a1", "u1", "One more")).toBe("full");
		expect(ops("insert", "drum_kit")).toEqual([]);
	});
	it("a site kit is not counted against any cap", async () => {
		expect(await createDrumKit(null, "u1", "Site 2")).toMatchObject({
			accountId: null,
			name: "Site 2",
		});
		expect(ops("select", "drum_kit")).toEqual([]);
	});
});

describe("renameDrumKit", () => {
	it("a built-in keeps its name, with nothing written", async () => {
		expect(await renameDrumKit(null, "acoustic", "Loud")).toBeNull();
		expect(ops("update", "drum_kit")).toEqual([]);
	});
	it("only the scope's own kit", async () => {
		expect(await renameDrumKit("a1", "k2", "X")).toBeNull();
		expect(await renameDrumKit(null, "k1", "X")).toBeNull();
		expect(await renameDrumKit("a1", "k1", "  New  ")).toEqual({ id: "k1", name: "New" });
		expect(await renameDrumKit(null, "s1", "Z")).toEqual({ id: "s1", name: "Z" });
	});
});

describe("deleteDrumKit", () => {
	it("false for a built-in or another scope's kit, nothing removed", async () => {
		expect(await deleteDrumKit(null, "acoustic")).toBe(false);
		expect(await deleteDrumKit("a1", "k2")).toBe(false);
		expect(fake.rows("drumKit")).toHaveLength(4);
		expect(blob.deleteBlobs).not.toHaveBeenCalled();
	});
	it("removes the kit, its samples and their files", async () => {
		expect(await deleteDrumKit("a1", "k1")).toBe(true);
		expect(ids(fake.rows("drumKit"))).toEqual(["s1", "acoustic", "k2"]);
		expect(ids(fake.rows("drumSample"))).toEqual(["sm1", "sm6", "sm7"]);
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"https://blob/sm2.wav",
			"https://blob/sm3.wav",
			"https://blob/sm4.wav",
			"https://blob/sm5.wav",
			"https://blob/sm8.wav",
		]);
	});
});

describe("createDrumSample", () => {
	const file = { filename: "Rim.WAV", contentType: "audio/wav", sizeBytes: 12 };
	it("null when the kit is not the scope's", async () => {
		expect(await createDrumSample("a1", "u1", "k2", "rim", file)).toBeNull();
		expect(await createDrumSample(null, "u1", "k1", "rim", file)).toBeNull();
		expect(ops("insert", "drum_sample")).toEqual([]);
	});
	it("reserves the row at its pathname, uploading, with no URL yet", async () => {
		const row = await createDrumSample("a1", "u1", "k1", "rim", file);
		expect(row).toMatchObject({
			kitId: "k1",
			accountId: "a1",
			voice: "rim",
			status: "uploading",
			url: "",
			pathname: `accounts/a1/kits/k1/${row!.id}.wav`,
			filename: "Rim.WAV",
			sizeBytes: 12,
			uploadedBy: "u1",
			source: "",
		});
	});
});

describe("drumSampleOwner", () => {
	it("the kit, account and pathname, or null", async () => {
		expect(await drumSampleOwner("sm3")).toEqual({
			kitId: "k1",
			accountId: "a1",
			pathname: "accounts/a1/kits/k1/sm3.wav",
		});
		expect(await drumSampleOwner("nope")).toBeNull();
	});
});

describe("markDrumSampleReady", () => {
	it("null for an unknown sample, nothing deleted", async () => {
		expect(await markDrumSampleReady("nope", "https://blob/x.wav")).toBeNull();
		expect(blob.deleteBlobs).not.toHaveBeenCalled();
	});
	it("the voice's earlier files go with the row, the other voices stay", async () => {
		expect(await markDrumSampleReady("sm8", "https://blob/new.wav")).toEqual({
			id: "sm8",
			kitId: "k1",
			voice: "kick",
		});
		expect(fake.rows("drumSample").find((r) => r.id === "sm8")).toMatchObject({
			status: "ready",
			url: "https://blob/new.wav",
		});
		expect(ids(fake.rows("drumSample"))).toEqual(["sm1", "sm4", "sm5", "sm6", "sm7", "sm8"]);
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://blob/sm2.wav", "https://blob/sm3.wav"]);
	});
});

describe("recordDrumSampleUrl", () => {
	it("marks the uploading row at that pathname ready", async () => {
		await recordDrumSampleUrl("accounts/a1/kits/k1/sm8.wav", "https://blob/hook.wav");
		expect(fake.rows("drumSample").find((r) => r.id === "sm8")).toMatchObject({
			status: "ready",
			url: "https://blob/hook.wav",
		});
	});
	it("a row already ready is left alone", async () => {
		await recordDrumSampleUrl("accounts/a1/kits/k1/sm3.wav", "https://blob/hook.wav");
		expect(ops("update", "drum_sample")).toEqual([]);
	});
});

describe("setDrumSampleSource / deleteDrumSample", () => {
	it("records the provenance", async () => {
		expect(await setDrumSampleSource("sm3", "Groovie")).toEqual({ id: "sm3", source: "Groovie" });
		expect(await setDrumSampleSource("nope", "x")).toBeNull();
	});
	it("removes the row and its file; false when there is none", async () => {
		expect(await deleteDrumSample("sm1")).toBe(true);
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://blob/sm1.wav"]);
		expect(await deleteDrumSample("sm1")).toBe(false);
		expect(blob.deleteBlobs).toHaveBeenCalledTimes(1);
	});
});

describe("deleteAccountDrumKits", () => {
	it("removes the account's kits and samples with their files, the rest untouched", async () => {
		await deleteAccountDrumKits("a1");
		expect(ids(fake.rows("drumKit"))).toEqual(["s1", "acoustic", "k2"]);
		expect(ids(fake.rows("drumSample"))).toEqual(["sm1", "sm6", "sm7"]);
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"https://blob/sm2.wav",
			"https://blob/sm3.wav",
			"https://blob/sm4.wav",
			"https://blob/sm5.wav",
			"https://blob/sm8.wav",
		]);
	});
});

// ---- beats ----

const drumData = { version: 1, bpm: 90 } as unknown as DrumProject;
const beatOf = (id: string, accountId: string, songId: string | null, minute: number) => ({
	id,
	accountId,
	createdBy: "u1",
	songId,
	name: id,
	data: drumData,
	createdAt: at(minute),
	updatedAt: at(minute),
});
const change = (kind: string, start: number, value: string) => ({ kind, start, value });
const songs = {
	account: [{ id: "a1", slug: "acme", name: "Acme" }],
	project: [{ id: "p1", accountId: "a1", slug: "proj", name: "Proj" }],
	song: [
		{
			id: "s1",
			accountId: "a1",
			projectId: "p1",
			title: "Song One",
			slug: "song-one",
			changes: [change("tempo", 8, "90"), change("tempo", 0, "119.6"), change("meter", 0, "4/4")],
		},
		{ id: "s2", accountId: "a1", projectId: "p1", title: "Quiet", slug: "quiet", changes: [] },
	],
	beat: [beatOf("b1", "a1", "s1", 1), beatOf("b2", "a1", null, 2), beatOf("b3", "a2", null, 3)],
};

describe("beats", () => {
	beforeEach(() => fake.reset(songs));
	it("listBeats: the account's, newest first, each with its song", async () => {
		expect((await listBeats("a1")).map((b) => [b.id, b.song])).toEqual([
			["b2", null],
			["b1", { id: "s1", title: "Song One" }],
		]);
	});
	it("songForBeat: null for another account's song", async () => {
		expect(await songForBeat("a2", "s1")).toBeNull();
	});
	it("songForBeat: the page, the tempo at the start rounded, the meter at the start", async () => {
		expect(await songForBeat("a1", "s1")).toEqual({
			id: "s1",
			title: "Song One",
			href: "/acme/projects/proj/song-one",
			bpm: 120,
			meter: "4/4",
		});
		expect(await songForBeat("a1", "s2")).toMatchObject({ bpm: null, meter: null });
	});
	it("createBeat: a blank name is 'Untitled beat', no song unless given", async () => {
		expect(await createBeat("a1", "u1", "  ", drumData)).toMatchObject({
			accountId: "a1",
			createdBy: "u1",
			name: "Untitled beat",
			songId: null,
		});
		expect(await createBeat("a1", "u1", "Groove", drumData, "s1")).toMatchObject({
			name: "Groove",
			songId: "s1",
		});
	});
	it("updateBeat / renameBeat: the account's own only", async () => {
		const data = { version: 1, bpm: 140 } as unknown as DrumProject;
		expect(await updateBeat("a2", "b1", { name: "X", data })).toBeNull();
		expect(await updateBeat("a1", "b1", { name: " New ", data })).toMatchObject({
			name: "New",
			data,
		});
		expect(await renameBeat("a1", "b1", "")).toMatchObject({ name: "Untitled beat" });
		expect(await renameBeat("a2", "b1", "Z")).toBeNull();
	});
	it("deleteBeat: scoped", async () => {
		await deleteBeat("a2", "b1");
		expect(ids(fake.rows("beat"))).toEqual(["b1", "b2", "b3"]);
		await deleteBeat("a1", "b1");
		expect(ids(fake.rows("beat"))).toEqual(["b2", "b3"]);
	});
});

// ---- progressions ----

const chord: ProgressionData["entries"][number] = {
	kind: "chord",
	label: "C",
	wedge: "I",
	notes: [60, 64, 67],
	beats: 4,
};
const prog = (entries: ProgressionData["entries"]): ProgressionData => ({
	bpm: 100,
	beatsPerBar: 4,
	entries,
});
const progOf = (
	id: string,
	accountId: string,
	data: ProgressionData,
	notes: string,
	minute: number,
) => ({
	id,
	accountId,
	createdBy: "u1",
	name: id,
	data,
	notes,
	createdAt: at(minute),
	updatedAt: at(minute),
});
const progressions = {
	progression: [
		progOf("p1", "a1", prog([]), "", 1),
		progOf("p2", "a1", prog([chord]), "", 2),
		progOf("p3", "a1", prog([]), "keep", 3),
		progOf("p4", "a2", prog([]), "", 4),
	],
};

describe("progressions", () => {
	beforeEach(() => fake.reset(progressions));
	it("listProgressions: the account's, newest first, without the timestamps it does not need", async () => {
		const rows = await listProgressions("a1");
		expect(ids(rows)).toEqual(["p3", "p2", "p1"]);
		expect(Object.keys(rows[0])).toEqual(["id", "name", "data", "notes", "createdBy", "updatedAt"]);
	});
	it("createProgression: a blank name is 'Untitled progression', notes empty by default", async () => {
		expect(await createProgression("a1", "u1", " ", prog([chord]))).toMatchObject({
			accountId: "a1",
			name: "Untitled progression",
			notes: "",
		});
		expect(await createProgression("a1", "u1", "Two", prog([]), "hi")).toMatchObject({
			name: "Two",
			notes: "hi",
		});
	});
	it("updateProgression: notes stay unless given; another account's is null", async () => {
		expect(await updateProgression("a1", "p3", { name: "N", data: prog([chord]) })).toMatchObject({
			name: "N",
			notes: "keep",
		});
		expect(
			await updateProgression("a1", "p3", { name: "N", data: prog([]), notes: "" }),
		).toMatchObject({
			notes: "",
		});
		expect(await updateProgression("a2", "p3", { name: "N", data: prog([]) })).toBeNull();
	});
	it("setProgressionNotes: true when the row was the account's", async () => {
		expect(await setProgressionNotes("a1", "p1", "notes")).toBe(true);
		expect(fake.rows("progression")[0].notes).toBe("notes");
		expect(await setProgressionNotes("a2", "p1", "x")).toBe(false);
	});
	it("deleteProgressionIfEmpty: only a progression with neither chords nor notes goes", async () => {
		expect(await deleteProgressionIfEmpty("a2", "p1")).toBe(false);
		expect(await deleteProgressionIfEmpty("a1", "p2")).toBe(false);
		expect(await deleteProgressionIfEmpty("a1", "p3")).toBe(false);
		expect(await deleteProgressionIfEmpty("a1", "p1")).toBe(true);
		expect(ids(fake.rows("progression"))).toEqual(["p2", "p3", "p4"]);
	});
	it("renameProgression / deleteProgression: scoped", async () => {
		expect(await renameProgression("a2", "p1", "X")).toBeNull();
		expect(await renameProgression("a1", "p1", " ")).toMatchObject({
			name: "Untitled progression",
		});
		await deleteProgression("a2", "p1");
		await deleteProgression("a1", "p2");
		expect(ids(fake.rows("progression"))).toEqual(["p1", "p3", "p4"]);
	});
});

// ---- chord styles ----

const style = { major: {}, minor: {} } as unknown as ChordStyleData;
const styleOf = (id: string, accountId: string, minute: number) => ({
	id,
	accountId,
	createdBy: "u1",
	name: id,
	data: style,
	createdAt: at(minute),
	updatedAt: at(minute),
});
const styles = {
	chordStyle: [styleOf("cs1", "a1", 1), styleOf("cs2", "a1", 2), styleOf("cs3", "a2", 3)],
};

describe("chord styles", () => {
	beforeEach(() => fake.reset(styles));
	it("listChordStyles: the account's, newest first", async () => {
		const rows = await listChordStyles("a1");
		expect(ids(rows)).toEqual(["cs2", "cs1"]);
		expect(Object.keys(rows[0])).toEqual(["id", "name", "data", "createdBy", "updatedAt"]);
	});
	it("createChordStyle: a blank name is 'Untitled style'", async () => {
		expect(await createChordStyle("a1", "u1", "", style)).toMatchObject({
			accountId: "a1",
			createdBy: "u1",
			name: "Untitled style",
			data: style,
		});
	});
	it("updateChordStyle / renameChordStyle: the account's own only", async () => {
		const data = { major: { 1: "x" }, minor: {} } as unknown as ChordStyleData;
		expect(await updateChordStyle("a2", "cs1", { name: "X", data })).toBeNull();
		expect(await updateChordStyle("a1", "cs1", { name: " Jazz ", data })).toMatchObject({
			name: "Jazz",
			data,
		});
		expect(await renameChordStyle("a1", "cs1", " ")).toMatchObject({ name: "Untitled style" });
		expect(await renameChordStyle("a2", "cs1", "Z")).toBeNull();
	});
	it("deleteChordStyle: scoped", async () => {
		await deleteChordStyle("a2", "cs1");
		await deleteChordStyle("a1", "cs2");
		expect(ids(fake.rows("chordStyle"))).toEqual(["cs1", "cs3"]);
	});
});

// ---- piano presets ----

const sound = { reverb: 0.5 } as PianoPresetData;
const presetOf = (
	id: string,
	accountId: string,
	slot: number | null,
	chordSlot: number | null,
	minute: number,
) => ({
	id,
	accountId,
	createdBy: "u1",
	name: id,
	slot,
	chordSlot,
	data: sound,
	createdAt: at(minute),
	updatedAt: at(minute),
});
const presets = {
	pianoPreset: [
		presetOf("pp1", "a1", 3, null, 1),
		presetOf("pp2", "a1", null, 2, 2),
		presetOf("pp3", "a1", 1, null, 3),
		presetOf("pp4", "a2", 3, null, 4),
		presetOf("pp5", "a1", null, null, 0),
	],
};
const slotsOf = () =>
	Object.fromEntries(fake.rows("pianoPreset").map((r) => [r.id, [r.slot, r.chordSlot]]));

describe("piano presets", () => {
	beforeEach(() => fake.reset(presets));
	it("listPianoPresets: the slotted ones by slot, then the rest newest first", async () => {
		expect(ids(await listPianoPresets("a1"))).toEqual(["pp3", "pp1", "pp2", "pp5"]);
	});
	it("createPianoPreset: takes the slot from its previous holder, in the account only", async () => {
		const row = await createPianoPreset("a1", "u1", " ", sound, 3);
		expect(row).toMatchObject({ name: "Untitled preset", slot: 3, chordSlot: null });
		expect(slotsOf()).toMatchObject({ pp1: [null, null], pp4: [3, null], [row.id]: [3, null] });
	});
	it("createPianoPreset: the chord player's slot is its own column", async () => {
		const row = await createPianoPreset("a1", "u1", "Pad", sound, 2, "chords");
		expect(row).toMatchObject({ slot: null, chordSlot: 2 });
		expect(slotsOf()).toMatchObject({ pp2: [null, null], pp1: [3, null] });
	});
	it("createPianoPreset: no slot frees nothing", async () => {
		await createPianoPreset("a1", "u1", "Loose", sound, null);
		expect(ops("update", "piano_preset")).toEqual([]);
	});
	it("updatePianoPreset: a slot given moves the button, one left out keeps it; another account's is null", async () => {
		expect(await updatePianoPreset("a1", "pp2", { name: "N", data: sound, slot: 1 })).toMatchObject(
			{
				slot: 1,
				chordSlot: 2,
			},
		);
		expect(slotsOf()).toMatchObject({ pp3: [null, null], pp2: [1, 2] });
		expect(await updatePianoPreset("a1", "pp1", { name: "M", data: sound })).toMatchObject({
			slot: 3,
		});
		expect(await updatePianoPreset("a2", "pp1", { name: "M", data: sound })).toBeNull();
	});
	it("renamePianoPreset: a blank name is 'Untitled preset'", async () => {
		expect(await renamePianoPreset("a1", "pp1", " ")).toMatchObject({ name: "Untitled preset" });
		expect(await renamePianoPreset("a2", "pp1", "Z")).toBeNull();
	});
	it("setPianoPresetSlot: a slot taken is freed from its previous holder", async () => {
		expect(await setPianoPresetSlot("a1", "pp2", 3)).toMatchObject({ slot: 3 });
		expect(slotsOf()).toMatchObject({ pp1: [null, null], pp2: [3, 2] });
	});
	it("setPianoPresetSlot: null clears without touching the others", async () => {
		expect(await setPianoPresetSlot("a1", "pp1", null)).toMatchObject({ slot: null });
		expect(ops("update", "piano_preset")).toHaveLength(1);
	});
	it("setPianoPresetSlot: the chord player's slot leaves the piano's alone", async () => {
		expect(await setPianoPresetSlot("a1", "pp1", 2, "chords")).toMatchObject({
			slot: 3,
			chordSlot: 2,
		});
		expect(slotsOf()).toMatchObject({ pp2: [null, null] });
	});
	it("setPianoPresetSlot: another account's preset is null and frees nothing of this one", async () => {
		expect(await setPianoPresetSlot("a2", "pp1", 1)).toBeNull();
		expect(slotsOf()).toMatchObject({ pp3: [1, null] });
	});
	it("deletePianoPreset: scoped; countPianoPresets counts the account's", async () => {
		expect(await countPianoPresets("a1")).toBe(4);
		await deletePianoPreset("a2", "pp1");
		await deletePianoPreset("a1", "pp5");
		expect(ids(fake.rows("pianoPreset"))).toEqual(["pp1", "pp2", "pp3", "pp4"]);
		expect(await countPianoPresets("a1")).toBe(3);
		expect(await countPianoPresets("zz")).toBe(0);
	});
});

describe("site piano presets", () => {
	const warm = v.parse(NamedPianoPresetSchema, { name: "Warm", data: {} });
	it("five empty slots with no setting, or an unreadable one", async () => {
		expect(await sitePianoPresets()).toEqual([null, null, null, null, null]);
		fake.reset({ appSetting: [{ key: "pianoPresets", value: "{nope" }] });
		expect(await sitePianoPresets()).toEqual([null, null, null, null, null]);
	});
	it("the entries that parse, per instrument", async () => {
		fake.reset({
			appSetting: [
				{ key: "pianoPresets", value: JSON.stringify([warm, { name: "" }, null]) },
				{ key: "chordPresets", value: JSON.stringify([null, warm]) },
			],
		});
		expect(await sitePianoPresets()).toEqual([warm, null, null, null, null]);
		expect(await sitePianoPresets("chords")).toEqual([null, warm, null, null, null]);
	});
	it("setSitePianoPreset: writes the rack with the slot replaced", async () => {
		await setSitePianoPreset(2, warm);
		expect(ops("insert", "app_setting")[0].values).toEqual({
			key: "pianoPresets",
			value: JSON.stringify([null, warm, null, null, null]),
		});
		await setSitePianoPreset(1, warm, "chords");
		expect(ops("insert", "app_setting")[1].values).toEqual({
			key: "chordPresets",
			value: JSON.stringify([warm, null, null, null, null]),
		});
	});
	it("setSitePianoPreset: null empties a slot of the stored rack", async () => {
		fake.reset({ appSetting: [{ key: "pianoPresets", value: JSON.stringify([warm, warm]) }] });
		await setSitePianoPreset(1, null);
		expect(ops("insert", "app_setting")[0].values).toEqual({
			key: "pianoPresets",
			value: JSON.stringify([null, warm, null, null, null]),
		});
	});
});
