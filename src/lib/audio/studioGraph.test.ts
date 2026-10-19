import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import { describe, expect, it, vi } from "vite-plus/test";

/** The strips as stand-ins: what each is routed to and which sends it holds is what the test reads. */
const strips: { opts: unknown; routed: unknown; sends: unknown; disposed: boolean }[] = [];
vi.mock("./stripGraph", () => ({
	createStripGraph: (_ctx: unknown, opts: unknown) => {
		const s = {
			opts,
			routed: null as unknown,
			sends: null as unknown,
			disposed: false,
			input: { name: "in" },
			fader: { gain: { value: 1 } },
			route(dest: unknown) {
				s.routed = dest;
			},
			setSends(list: unknown) {
				s.sends = list;
			},
			dispose() {
				s.disposed = true;
			},
		};
		strips.push(s);
		return s;
	},
}));
const { StudioGraph } = await import("./studioGraph");
/** A strip as the stand-in made it. */
const fakeOf = (strip: unknown) =>
	strip as { routed: unknown; sends: unknown; disposed: boolean; input: unknown };

const ctx = { currentTime: 0, destination: { name: "dest" } } as unknown as AudioContext;
const track = (id: string, over: Record<string, unknown> = {}) =>
	({
		id,
		name: id,
		gain: 1,
		pan: 0,
		muted: false,
		solo: false,
		armed: false,
		input: null,
		...over,
	}) as never;
const arrangement = (over: Partial<StudioArrangement> = {}): StudioArrangement => ({
	version: 1,
	bpm: 120,
	beatsPerBar: 4,
	gridOn: true,
	countIn: false,
	click: false,
	loop: null,
	master: 0.8,
	tracks: [track("t1"), track("t2", { output: "b1", sends: [{ bus: "b1", level: 0.3 }] })],
	clips: [],
	buses: [{ id: "b1", name: "Bus", gain: 0.9, pan: 0, muted: false }],
	...over,
});

describe("StudioGraph", () => {
	it("builds the master, a strip per bus and track, routes them and settles each once", () => {
		strips.length = 0;
		const hooks = { gainOf: vi.fn(() => 0.5), busGainOf: vi.fn(() => 0.9), settle: vi.fn() };
		const a = arrangement();
		const g = new StudioGraph(ctx, hooks, a);
		expect(g.master.fader.gain.value).toBe(0.8);
		expect(strips[0]!.routed).toBe(ctx.destination);
		g.ensureAll(a);
		expect(g.buses.size).toBe(1);
		expect(g.tracks.size).toBe(2);
		expect(fakeOf(g.stripOf("b1")).routed).toBe(g.master.input);
		// t1 goes to the master, t2 to the bus, with its send list handed on.
		expect(fakeOf(g.stripOf("t1")).routed).toBe(g.master.input);
		expect(fakeOf(g.stripOf("t2")).routed).toBe(g.stripOf("b1")!.input);
		expect((g.stripOf("t2") as unknown as { sends: unknown }).sends).toEqual([
			{ bus: "b1", level: 0.3 },
		]);
		expect(g.stripOf("t1")!.fader.gain.value).toBe(0.5);
		expect(hooks.settle).toHaveBeenCalledTimes(3);
		expect(g.stripOf("master")).toBe(g.master);
		expect(g.stripOf("zzz")).toBeNull();
	});
	it("drops strips whose owners are gone and keeps the rest; dispose frees them all", () => {
		strips.length = 0;
		const hooks = { gainOf: () => 1, busGainOf: () => 1, settle: vi.fn() };
		const a = arrangement();
		const g = new StudioGraph(ctx, hooks, a);
		g.ensureAll(a);
		const t2 = g.stripOf("t2")!;
		const b1 = g.stripOf("b1")!;
		g.ensureAll(arrangement({ tracks: [track("t1")], buses: [] }));
		expect(g.tracks.size).toBe(1);
		expect(g.buses.size).toBe(0);
		expect((t2 as unknown as { disposed: boolean }).disposed).toBe(true);
		expect((b1 as unknown as { disposed: boolean }).disposed).toBe(true);
		// The same track again is the same strip, not a new one.
		expect(g.ensureTrack(a, "t1")).toBe(g.stripOf("t1"));
		g.dispose();
		expect(strips.every((s) => s.disposed)).toBe(true);
	});
});
