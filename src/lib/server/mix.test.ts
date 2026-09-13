import { describe, expect, test, vi } from "vite-plus/test";

// mix.ts reaches the database, Blob and ffmpeg through these modules; the
// pure request parsing is what this file tests, so they are stubbed.
vi.mock("$lib/server/data", () => ({
	songForMix: vi.fn(),
	setSongMix: vi.fn(),
	claimSongMix: vi.fn(),
	releaseSongMix: vi.fn(),
}));
vi.mock("$lib/server/blob", () => ({
	deleteBlobs: vi.fn(),
	mixPathname: vi.fn(),
	putBlob: vi.fn(),
}));
vi.mock("$lib/server/background", () => ({ background: vi.fn() }));
vi.mock("ffmpeg-static", () => ({ default: "/usr/bin/ffmpeg" }));

const { isOriginal, mixKeyOf, parseMixRequest } = await import("./mix");
type Mixable = Parameters<typeof parseMixRequest>[0];

const song = {
	id: "s1",
	accountId: "a1",
	title: "Song",
	slug: "song",
	mixUrl: null,
	mixKey: null,
	mixStartedAt: null,
	project: { slug: "proj", account: { name: "Band" } },
	stems: [
		{
			id: "stemA",
			status: "ready",
			url: "https://blob/a.wav",
			channels: 2,
			playbackStatus: "ready",
			playbackUrl: "https://blob/a.m4a",
		},
		{
			id: "stemB",
			status: "ready",
			url: "https://blob/b.wav",
			channels: 1,
			playbackStatus: null,
			playbackUrl: null,
		},
	],
} as unknown as Mixable;

describe("parseMixRequest", () => {
	test("no query is the original: every stem at unity, master 1", () => {
		expect(parseMixRequest(song, new URLSearchParams())).toEqual({
			stems: [
				{ id: "stemA", gain: 1 },
				{ id: "stemB", gain: 1 },
			],
			master: 1,
		});
	});
	test("a custom mix names stems with gains and a master", () => {
		const req = parseMixRequest(
			song,
			new URLSearchParams("stems=stemA:1.000,stemB:0.500&master=0.800"),
		);
		expect(req).toEqual({
			stems: [
				{ id: "stemA", gain: 1 },
				{ id: "stemB", gain: 0.5 },
			],
			master: 0.8,
		});
	});
	test("rejects unknown ids, gains outside the fader range, duplicates, an empty list and a bad master", () => {
		expect(parseMixRequest(song, new URLSearchParams("stems=nope:1"))).toBeNull();
		expect(parseMixRequest(song, new URLSearchParams("stems=stemA:9"))).toBeNull();
		expect(parseMixRequest(song, new URLSearchParams("stems=stemA:0"))).toBeNull();
		expect(parseMixRequest(song, new URLSearchParams("stems=stemA:1,stemA:1"))).toBeNull();
		expect(parseMixRequest(song, new URLSearchParams("stems="))).toBeNull();
		expect(parseMixRequest(song, new URLSearchParams("stems=stemA:1&master=2"))).toBeNull();
	});
});

describe("isOriginal", () => {
	test("all stems at unity with master 1 is the original, whatever the order", () => {
		expect(
			isOriginal(song, {
				stems: [
					{ id: "stemB", gain: 1 },
					{ id: "stemA", gain: 1 },
				],
				master: 1,
			}),
		).toBe(true);
		expect(isOriginal(song, { stems: [{ id: "stemA", gain: 1 }], master: 1 })).toBe(false);
		expect(
			isOriginal(song, {
				stems: [
					{ id: "stemA", gain: 1 },
					{ id: "stemB", gain: 0.5 },
				],
				master: 1,
			}),
		).toBe(false);
		expect(
			isOriginal(song, {
				stems: [
					{ id: "stemA", gain: 1 },
					{ id: "stemB", gain: 1 },
				],
				master: 0.9,
			}),
		).toBe(false);
	});
});

describe("mixKeyOf", () => {
	test("depends on which file each stem plays from, in any order", () => {
		const a = mixKeyOf(song.stems);
		const b = mixKeyOf([...song.stems].reverse());
		expect(a).toBe(b);
		expect(a).toHaveLength(16);
		const swapped = mixKeyOf([{ ...song.stems[0], playbackStatus: null }, song.stems[1]]);
		expect(swapped).not.toBe(a);
	});
});
