import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The song page's downloads over stand-ins: the mix, the zip, the default mix
 * and the Dawn import are recorded calls, the notices and the navigation too.
 */
const saveMix = vi.hoisted(() => vi.fn(async () => {}));
const saveStemsZip = vi.hoisted(() =>
	vi.fn(
		async (
			stems: { label: string }[],
			_name: string,
			onProgress?: (done: number, total: number) => void,
		) => {
			for (let i = 0; i <= stems.length; i++) onProgress?.(i, stems.length);
		},
	),
);
const mixQuery = vi.hoisted(() =>
	vi.fn((mode: string, engine?: { audible: boolean } | null) =>
		mode !== "custom" ? "" : engine?.audible ? "?stems=a:1.000" : null,
	),
);
vi.mock("#lib/audio/downloads.js", () => ({ saveMix, saveStemsZip, mixQuery }));
const saveDefaultMix = vi.hoisted(() => vi.fn(async (_args: unknown) => {}));
vi.mock("#lib/remote/songs.remote.js", () => ({ saveDefaultMix }));
const importSongStems = vi.hoisted(() =>
	vi.fn(async (_args: unknown) => ({ ideaId: "idea1", tracks: 3, left: 0 })),
);
vi.mock("#lib/remote/studio.remote.js", () => ({ importSongStems }));
const notify = vi.hoisted(() => vi.fn());
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify }));
const goto = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("$app/navigation", () => ({ goto }));

const { SongDownloads } = await import("./songDownloads.svelte.js");

const song = { id: "song1", slug: "letter-lands", version: "1.2.3", project: { slug: "badverbs" } };
const stem = (label: string) => ({ url: `https://blob/${label}`, filename: `${label}.wav`, label });

function setup(
	opts: {
		ready?: ReturnType<typeof stem>[];
		engine?: unknown;
	} = {},
) {
	const onmixsaved = vi.fn(async () => {});
	const downloads = new SongDownloads({
		song: () => song,
		ready: () => opts.ready ?? [stem("Bass"), stem("Drums")],
		engine: () => (opts.engine ?? null) as never,
		onmixsaved,
	});
	return { downloads, onmixsaved };
}

beforeEach(() => {
	for (const m of [saveMix, saveStemsZip, mixQuery, saveDefaultMix, importSongStems, notify, goto])
		m.mockClear();
});
afterEach(() => {
	vi.unstubAllGlobals();
});

describe("SongDownloads", () => {
	test("names every download after the project, the song and its version", () => {
		expect(setup().downloads.name).toBe("badverbs-letter-lands-v1.2.3");
	});

	test("the original mix renders under its name, mixing while it does", async () => {
		const { downloads } = setup();
		saveMix.mockImplementationOnce(async () => {
			expect(downloads.mixing).toBe("original");
		});
		await downloads.downloadMix("original");
		expect(saveMix).toHaveBeenCalledWith("song1", "badverbs-letter-lands-v1.2.3", "original", "");
		expect(downloads.mixing).toBeNull();
		expect(downloads.mixError).toBeNull();
	});

	test("a custom mix with nothing audible is refused with a message", async () => {
		const { downloads } = setup({ engine: { audible: false } });
		await downloads.downloadMix("custom");
		expect(downloads.mixError).toBe("Nothing is audible — unmute a stem first.");
		expect(saveMix).not.toHaveBeenCalled();
	});

	test("a failed mix keeps the server's message", async () => {
		const { downloads } = setup({ engine: { audible: true } });
		saveMix.mockRejectedValueOnce(new Error("Mix failed"));
		await downloads.downloadMix("custom");
		expect(downloads.mixError).toBe("Mix failed");
		expect(downloads.mixing).toBeNull();
	});

	test("the zip reports its progress, then clears it and says the browser is saving", async () => {
		const { downloads } = setup();
		const seen: (string | null)[] = [];
		saveStemsZip.mockImplementationOnce(async (_stems, _name, onProgress) => {
			onProgress?.(1, 2);
			seen.push(downloads.zipping);
		});
		await downloads.downloadAll();
		expect(seen).toEqual(["Preparing… 1 of 2"]);
		expect(downloads.zipping).toBeNull();
		expect(notify).toHaveBeenLastCalledWith(
			"Stems zip ready (2 stems): your browser is saving it",
			{ id: "stems-zip", kind: "success" },
		);
	});

	test("no ready stems, no zip", async () => {
		const { downloads } = setup({ ready: [] });
		await downloads.downloadAll();
		expect(saveStemsZip).not.toHaveBeenCalled();
	});

	test("a failed zip is an error notice", async () => {
		const { downloads } = setup();
		saveStemsZip.mockRejectedValueOnce(new Error("Network down"));
		await downloads.downloadAll();
		expect(notify).toHaveBeenLastCalledWith("Could not prepare the stems zip: Network down", {
			id: "stems-zip",
			kind: "error",
		});
		expect(downloads.zipping).toBeNull();
	});

	test("Open in Dawn imports the stems and goes to the new Dawn song", async () => {
		const { downloads } = setup();
		await downloads.openInDawn();
		expect(importSongStems).toHaveBeenCalledWith({ songId: "song1" });
		expect(goto).toHaveBeenCalledWith("/multitrack-recorder?song=idea1");
		expect(downloads.openingInDawn).toBe(false);
	});

	test("saving the default mix sends the rounded levels after a confirmation", async () => {
		vi.stubGlobal(
			"confirm",
			vi.fn(() => true),
		);
		const engine = { stems: [{ id: "s1", gain: 0.123456, pan: -0.3333 }] };
		const { downloads, onmixsaved } = setup({ engine });
		await downloads.saveMixAsDefault();
		expect(saveDefaultMix).toHaveBeenCalledWith({
			id: "song1",
			gains: [{ id: "s1", gain: 0.123, pan: -0.33 }],
		});
		expect(onmixsaved).toHaveBeenCalled();
		expect(downloads.savingMix).toBe(false);
	});

	test("declining the confirmation saves nothing", async () => {
		vi.stubGlobal(
			"confirm",
			vi.fn(() => false),
		);
		const { downloads, onmixsaved } = setup({ engine: { stems: [] } });
		await downloads.saveMixAsDefault();
		expect(saveDefaultMix).not.toHaveBeenCalled();
		expect(onmixsaved).not.toHaveBeenCalled();
	});
});
