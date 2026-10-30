import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The settings' Details tab: the remote form is a stand-in whose fields hold
 * what was typed (undefined until then), the credit calls are recorded.
 */
const typed = vi.hoisted(() => ({}) as Record<string, string | undefined>);
const updateSong = vi.hoisted(() => {
	const field = (name: string) => ({
		value: () => typed[name],
		set: (v: string) => {
			typed[name] = v;
		},
	});
	const names = ["title", "slug", "description", "writtenOn", "version", "frameRate"];
	const fields = Object.fromEntries(
		[...names, "startAt", "endAt"].map((n) => [n, field(n)]),
	) as Record<string, ReturnType<typeof field>>;
	return {
		fields: Object.assign(fields, {
			set: () => {
				for (const k of Object.keys(typed)) delete typed[k];
			},
		}),
	};
});
const addSongCredit = vi.hoisted(() => vi.fn<(args: unknown) => Promise<void>>(async () => {}));
const removeSongCredit = vi.hoisted(() => vi.fn<(args: unknown) => Promise<void>>(async () => {}));
vi.mock("#lib/remote/songs.remote.js", () => ({ updateSong, addSongCredit, removeSongCredit }));
const notify = vi.hoisted(() => vi.fn());
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify }));

const { SongChanges } = await import("./songChanges.svelte");
const { SongDetails } = await import("./songDetails.svelte");

function make(over: { startAt?: number | null; endAt?: number | null } = {}) {
	const song = {
		id: "song1",
		title: "Letter Lands",
		slug: "letter-lands",
		description: "",
		writtenOn: null,
		version: "1.0.0",
		frameRate: 25,
		startAt: 2,
		endAt: null,
		changes: [],
		...over,
	};
	const onsaved = vi.fn(async () => {});
	const changes = new SongChanges({
		song: () => song,
		posCtx: () => ({ fps: 25, grid: null }),
		onsaved: async () => {},
	});
	const details = new SongDetails({ song: () => song, changes, onsaved });
	return { details, onsaved, changes };
}

beforeEach(() => {
	updateSong.fields.set();
	addSongCredit.mockReset();
	removeSongCredit.mockReset();
	notify.mockClear();
});

describe("SongDetails", () => {
	test("reads the song until a field is typed, and is dirty only after", () => {
		const { details, changes } = make();
		details.reset();
		expect(details.title).toBe("Letter Lands");
		expect(details.frameRate).toBe("25");
		expect(details.startAtEntry).toBe(changes.editPos(2));
		expect(details.endAtEntry).toBe("");
		expect(details.settingsDirty).toBe(false);
		updateSong.fields.title.set("Letter Lands II");
		expect(details.title).toBe("Letter Lands II");
		expect(details.settingsDirty).toBe(true);
	});

	test("a changed start is dirty; reset puts the entries and the form back", () => {
		const { details, changes } = make();
		details.reset();
		details.startAtEntry = changes.editPos(4);
		details.positionError = "End: something";
		updateSong.fields.slug.set("other");
		expect(details.settingsDirty).toBe(true);
		details.reset();
		expect(details.startAtEntry).toBe(changes.editPos(2));
		expect(details.positionError).toBeNull();
		expect(details.slug).toBe("letter-lands");
		expect(details.settingsDirty).toBe(false);
	});

	test("preparePositions writes seconds into the hidden fields, or names the bad one", () => {
		const { details } = make();
		details.reset();
		details.startAtEntry = "1:30";
		details.endAtEntry = "";
		expect(details.preparePositions()).toBe(true);
		expect(updateSong.fields.startAt.value()).toBe("90");
		expect(updateSong.fields.endAt.value()).toBe("");
		details.endAtEntry = "soon";
		expect(details.preparePositions()).toBe(false);
		expect(details.positionError).toMatch(/^End: /);
	});

	test("addCredit saves the name, clears the draft and refreshes; a failure is a notification", async () => {
		const { details, onsaved } = make();
		details.creditDraft.composer = "  Kevin  ";
		await details.addCredit("composer");
		expect(addSongCredit).toHaveBeenCalledWith({
			songId: "song1",
			role: "composer",
			name: "Kevin",
		});
		expect(details.creditDraft.composer).toBe("");
		expect(onsaved).toHaveBeenCalledTimes(1);
		expect(details.creditBusy).toBe(false);
		await details.addCredit("producer");
		expect(addSongCredit).toHaveBeenCalledTimes(1);
		removeSongCredit.mockRejectedValueOnce(new Error("Not found"));
		await details.removeCredit("c1");
		expect(removeSongCredit).toHaveBeenCalledWith({ id: "c1" });
		expect(notify).toHaveBeenCalledWith("Not found", { kind: "error" });
		expect(details.creditBusy).toBe(false);
	});
});
