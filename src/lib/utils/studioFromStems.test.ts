import { describe, expect, it } from "vite-plus/test";
import { studioFromStems } from "./studioFromStems";

const stem = (over: Partial<Parameters<typeof studioFromStems>[0]["stems"][number]> = {}) => ({
	id: "s1",
	label: "Guitar",
	url: "https://x.public.blob.vercel-storage.com/g.m4a",
	duration: 12.5,
	channels: 2,
	peaks: [0.1, 0.5],
	gain: 1.2,
	pan: -0.25,
	tint: "#abc",
	...over,
});

describe("studioFromStems", () => {
	it("makes a track, a clip and a source per stem, with the song's tempo, meter and key", () => {
		const made = studioFromStems({
			title: "Eat All the Clocks",
			changes: [
				{ kind: "tempo", start: 0, value: "132" },
				{ kind: "meter", start: 0, value: "3/4" },
				{ kind: "key", start: 0, value: "Em" },
			],
			stems: [stem(), stem({ id: "s2", label: "Drums", channels: 1, peaks: undefined })],
		});
		expect(made).not.toBeNull();
		expect(made!.title).toBe("Eat All the Clocks");
		expect(made!.current.bpm).toBe(132);
		expect(made!.current.beatsPerBar).toBe(3);
		expect(made!.current.key).toBe("Em");
		expect(made!.current.tracks.map((t) => [t.name, t.gain, t.pan, t.colour])).toEqual([
			["Guitar", 1.2, -0.25, "#abc"],
			["Drums", 1.2, -0.25, "#abc"],
		]);
		expect(made!.current.tracks.map((t) => t.mono)).toEqual([undefined, true]);
		expect(made!.current.clips.map((c) => [c.trackId, c.sourceId, c.duration])).toEqual([
			[made!.current.tracks[0]!.id, made!.sources[0]!.id, 12.5],
			[made!.current.tracks[1]!.id, made!.sources[1]!.id, 12.5],
		]);
		expect(made!.sources.map((s) => [s.url, s.channels, s.peaks])).toEqual([
			["https://x.public.blob.vercel-storage.com/g.m4a", 2, [0.1, 0.5]],
			["https://x.public.blob.vercel-storage.com/g.m4a", 1, []],
		]);
	});
	it("is null without a playable stem, and skips a stem with no URL", () => {
		expect(studioFromStems({ title: "x", changes: [], stems: [] })).toBeNull();
		expect(studioFromStems({ title: "x", changes: [], stems: [stem({ url: "" })] })).toBeNull();
		const made = studioFromStems({
			title: "x",
			changes: [],
			stems: [stem({ url: "" }), stem({ gain: undefined, pan: undefined })],
		});
		expect(made!.current.tracks).toHaveLength(1);
		expect(made!.current.tracks[0]!.gain).toBe(1);
		expect(made!.current.tracks[0]!.pan).toBe(0);
		expect(made!.current.bpm).toBe(120);
	});
});
