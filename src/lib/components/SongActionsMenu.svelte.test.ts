import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";

/**
 * The song player's action row over stand-ins: the real stem uploader and
 * replacer (never picked from), the remote functions and the navigation
 * recorded, nothing uploaded, downloaded or rendered.
 */
vi.mock("$app/navigation", () => ({ goto: vi.fn(), refreshAll: vi.fn() }));
vi.mock("#lib/remote/songs.remote.js", () => ({ removeStems: vi.fn(), saveDefaultMix: vi.fn() }));
vi.mock("#lib/remote/studio.remote.js", () => ({ importSongStems: vi.fn() }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: vi.fn() }));
const saveStemsZip = vi.hoisted(() => vi.fn());
vi.mock("#lib/audio/downloads.js", () => ({ saveStemsZip, saveMix: vi.fn(), mixQuery: vi.fn() }));

const { default: SongActionsMenu } = await import("./SongActionsMenu.svelte");
const { SongDownloads } = await import("#lib/state/songDownloads.svelte.js");
const { DemoUploads } = await import("#lib/state/demoUploads.svelte.js");

function setup(canEdit = true) {
	const song = {
		id: "song1",
		title: "Letter Lands",
		slug: "letter-lands",
		version: "1.0.0",
		project: { slug: "badverbs" },
		demos: [],
		stems: [{ id: "s1", label: "Bass", filename: "bass.wav", durationSeconds: 10, channels: 2 }],
	};
	const ready = [{ url: "https://blob/bass.wav", filename: "bass.wav", label: "Bass" }];
	const downloads = new SongDownloads({
		song: () => song,
		ready: () => ready,
		engine: () => null,
		onmixsaved: async () => {},
	});
	const demos = new DemoUploads({ song: () => song, onuploaded: async () => {} });
	const onshowdemos = vi.fn();
	render(SongActionsMenu, {
		downloads,
		demos,
		check: { applyDetection: () => {} } as never,
		song,
		docs: { lyrics: "la la", chart: null, notes: null },
		canEdit,
		engine: null,
		ready,
		readyDemos: [{}],
		mixBusy: false,
		mixDirty: false,
		fadersDirty: false,
		onuploaded: () => {},
		onpickmix: () => {},
		onpickfiles: () => {},
		onpicknotation: () => {},
		onshowdemos,
		onresetmix: () => {},
	});
	return { downloads, onshowdemos };
}

describe("SongActionsMenu", () => {
	test("both menu buttons render for an editor", () => {
		setup();
		expect(screen.getByText("Uploads")).toBeTruthy();
		expect(screen.getByText("Downloads")).toBeTruthy();
	});

	test("a listener sees the Downloads menu, not the Uploads", () => {
		setup(false);
		expect(screen.queryByText("Uploads")).toBeNull();
		expect(screen.getByText("Downloads")).toBeTruthy();
		expect(screen.queryByText("Open stems in Dawn")).toBeNull();
	});

	test("the Uploads menu lists its items for an editor", () => {
		setup();
		for (const item of [
			"Add Stems",
			"Replace Stems",
			"Upload Demos",
			"Upload Mix",
			"Upload Attachments",
			"Upload Notation",
			"Drum Machine",
		])
			expect(screen.getByText(item, { exact: false })).toBeTruthy();
		expect(screen.getAllByText("Record Demo")).toHaveLength(2);
	});

	test("the Downloads menu shows the stems, the mixes, Dawn, the PDF and the demos", async () => {
		const { onshowdemos } = setup();
		for (const item of [
			"Download Stems",
			"Original Stem Mix (MP3)",
			"Custom Stem Mix (MP3)",
			"Open stems in Dawn",
			"Song Documentation (PDF)",
		])
			expect(screen.getByText(item, { exact: false })).toBeTruthy();
		await fireEvent.click(screen.getByText("Demos (1)"));
		expect(onshowdemos).toHaveBeenCalled();
	});

	test("the zip's progress replaces Download Stems while it is built", async () => {
		const { downloads } = setup();
		downloads.zipping = "Preparing… 1 of 2";
		await Promise.resolve();
		const button = screen.getByText("Preparing… 1 of 2", { exact: false }).closest("button");
		expect(button?.disabled).toBe(true);
		expect(screen.queryByText("Download Stems")).toBeNull();
	});

	test("a click outside closes an open menu", async () => {
		setup();
		const menu = screen.getByText("Downloads").closest("details") as HTMLDetailsElement;
		menu.open = true;
		await fireEvent.pointerDown(document.body);
		expect(menu.open).toBe(false);
	});
});
