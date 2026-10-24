import { describe, expect, it } from "vite-plus/test";
import { applyPatch, patchBetween, type Json } from "./structuralPatch";

/** Asserts the round trip and leaves both inputs as they were. */
function roundTrip(from: Json, to: Json) {
	const before = JSON.stringify(from);
	const patch = patchBetween(from, to);
	expect(JSON.parse(JSON.stringify(patch))).toEqual(patch);
	expect(applyPatch(from, patch)).toEqual(to);
	expect(JSON.stringify(from)).toBe(before);
	return patch;
}

function arrangement(clipCount: number) {
	const tracks = Array.from({ length: 8 }, (_, n) => ({
		id: `t${n}`,
		name: `Track ${n}`,
		gain: 0.8,
		pan: 0,
		muted: false,
		solo: false,
		armed: false,
		input: null,
		automation: {
			volume: [
				{ t: 0, v: 0.5 },
				{ t: 4, v: 0.9 },
			],
			pan: [{ t: 1, v: -0.2 }],
		},
		sends: [{ id: `s${n}`, bus: "b0", level: 0.3 }],
	}));
	const clips = Array.from({ length: clipCount }, (_, n) => ({
		id: `c${n}`,
		trackId: `t${n % 8}`,
		sourceId: `source${n.toString().padStart(17, "0")}`,
		start: n * 2,
		offset: 0,
		duration: 1.75,
		gain: 1,
		fadeIn: 0.01,
		fadeOut: 0.01,
		name: `Take ${n}`,
		...(n % 5 === 0
			? {
					gainEnvelope: [
						{ t: 0, v: 1 },
						{ t: 1, v: 0.5 },
					],
				}
			: {}),
	}));
	return {
		version: 1,
		bpm: 120,
		beatsPerBar: 4,
		gridOn: true,
		countIn: false,
		click: true,
		loop: null,
		master: 0.9,
		masterAutomation: { volume: [{ t: 0, v: 1 }] },
		buses: [{ id: "b0", name: "Verb", gain: 0.7, pan: 0, muted: false }],
		tracks,
		clips,
		markers: [
			{ id: "m0", t: 0, name: "Intro", section: true },
			{ id: "m1", t: 16, name: "Verse" },
		],
		tempoChanges: [{ start: 30, bpm: 140 }],
	};
}

type Arrangement = ReturnType<typeof arrangement>;
const copy = <T>(x: T): T => structuredClone(x);

describe("patchBetween / applyPatch", () => {
	it("gives null for equal documents and sets changed primitives", () => {
		expect(patchBetween({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toBeNull();
		expect(patchBetween(3, 3)).toBeNull();
		expect(roundTrip(3, 4)).toEqual({ t: "s", v: 4 });
		expect(roundTrip("a", null)).toEqual({ t: "s", v: null });
		expect(roundTrip({ a: 1 }, [1])).toEqual({ t: "s", v: [1] });
	});

	it("patches nested objects key by key", () => {
		const patch = roundTrip({ a: { b: { c: 1, d: 2 } }, e: 5 }, { a: { b: { c: 9, d: 2 } }, e: 5 });
		expect(patch).toEqual({
			t: "o",
			k: { a: { t: "o", k: { b: { t: "o", k: { c: { t: "s", v: 9 } } } } } },
		});
	});

	it("deletes removed keys and treats undefined as absent", () => {
		expect(roundTrip({ a: 1, b: 2 }, { a: 1 })).toEqual({ t: "o", d: ["b"] });
		expect(patchBetween({ a: 1, b: undefined }, { a: 1 })).toBeNull();
		expect(roundTrip({ a: 1 }, { a: 1, b: { x: 1 } })).toEqual({
			t: "o",
			k: { b: { t: "s", v: { x: 1 } } },
		});
		expect(applyPatch({ a: 1, b: undefined }, { t: "o", k: { c: { t: "s", v: 2 } } })).toEqual({
			a: 1,
			c: 2,
		});
	});

	it("diffs id-keyed arrays by id", () => {
		const list = [
			{ id: "a", n: 1 },
			{ id: "b", n: 2 },
			{ id: "c", n: 3 },
		];
		expect(roundTrip(list, [...list.slice(0, 1), { id: "x", n: 9 }, ...list.slice(1)])).toEqual({
			t: "a",
			i: [[1, { id: "x", n: 9 }]],
		});
		expect(roundTrip(list, [list[0], list[2]])).toEqual({ t: "a", r: ["b"] });
		expect(roundTrip(list, [list[2], list[0], list[1]])).toEqual({ t: "a", o: ["c", "a", "b"] });
		expect(roundTrip(list, [list[0], { id: "b", n: 7 }, list[2]])).toEqual({
			t: "a",
			c: { b: { t: "o", k: { n: { t: "s", v: 7 } } } },
		});
		roundTrip(list, [{ id: "z", n: 0 }, list[2], { id: "y", n: 1 }, { id: "a", n: 5 }]);
		roundTrip([], list);
		roundTrip(list, []);
	});

	it("replaces other arrays whole", () => {
		const points = [
			{ t: 0, v: 1 },
			{ t: 1, v: 0.5 },
		];
		expect(roundTrip(points, [points[0], { t: 1, v: 0.6 }])).toEqual({
			t: "s",
			v: [points[0], { t: 1, v: 0.6 }],
		});
		expect(roundTrip([1, 2, 3], [1, 2])).toEqual({ t: "s", v: [1, 2] });
		expect(patchBetween([1, [2, 3]], [1, [2, 3]])).toBeNull();
		// Duplicate ids fall back to a whole replacement.
		roundTrip([{ id: "a" }, { id: "a" }], [{ id: "a", n: 1 }]);
	});

	it("shares unchanged subtrees with the input", () => {
		const from = arrangement(10);
		const to = copy(from);
		to.clips[3].start = 99;
		const out = applyPatch(from, patchBetween(from, to)) as Arrangement;
		expect(out.clips[2]).toBe(from.clips[2]);
		expect(out.tracks).toBe(from.tracks);
		expect(out.clips[3]).not.toBe(from.clips[3]);
	});

	it("round-trips a realistic arrangement through many kinds of edit", () => {
		const base = arrangement(50);
		const edits: ((a: Arrangement) => void)[] = [
			(a) => (a.clips[7].start += 0.5),
			(a) => a.clips.splice(12, 1),
			(a) => a.clips.push({ ...copy(a.clips[0]), id: "new", start: 400 }),
			(a) => a.clips.reverse(),
			(a) => (a.clips[20].gainEnvelope = [{ t: 0.2, v: 1.5 }]),
			(a) => delete (a.clips[10] as { gainEnvelope?: unknown }).gainEnvelope,
			(a) => (a.tracks[2].automation.volume[1].v = 0.1),
			(a) => delete (a.tracks[3].automation as { pan?: unknown }).pan,
			(a) => a.markers.push({ id: "m2", t: 40, name: "Chorus" }),
			(a) => (a.markers[0].section = false),
			(a) => (a.tempoChanges = []),
			(a) => (a.loop = { start: 1, end: 9 } as never),
			(a) => (a.bpm = 96),
			(a) => a.tracks.splice(1, 0, { ...copy(a.tracks[0]), id: "t9" }),
			(a) => a.buses.pop(),
		];
		let from = base;
		for (const edit of edits) {
			const alone = copy(base);
			edit(alone);
			roundTrip(base, alone);
			roundTrip(alone, base);
			const next = copy(from);
			edit(next);
			roundTrip(from, next);
			from = next;
		}
		roundTrip(base, from);
		roundTrip(from, base);
	});

	it("keeps a one-clip change in a 500-clip arrangement under 5% of the arrangement", () => {
		const from = arrangement(500);
		const size = JSON.stringify(from).length;
		const moved = copy(from);
		moved.clips[250].start += 1;
		const added = copy(from);
		added.clips.splice(100, 0, { ...copy(from.clips[0]), id: "fresh" });
		const removed = copy(from);
		removed.clips.splice(400, 1);
		for (const to of [moved, added, removed]) {
			const patch = roundTrip(from, to);
			expect(JSON.stringify(patch).length / size).toBeLessThan(0.05);
		}
	});
});
