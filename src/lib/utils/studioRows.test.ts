import { describe, expect, it } from "vite-plus/test";
import { studioRows } from "./studioRows";
import type { StudioBus, StudioTrack } from "#lib/val/StudioSchema.js";

const bus = (id: string, over: Partial<StudioBus> = {}): StudioBus => ({
	id,
	name: id,
	gain: 1,
	pan: 0,
	muted: false,
	...over,
});
const track = (id: string, output?: string): StudioTrack => ({
	id,
	name: id,
	gain: 1,
	pan: 0,
	muted: false,
	solo: false,
	armed: false,
	input: null,
	...(output ? { output } : {}),
});
const shape = (rows: ReturnType<typeof studioRows>) =>
	rows.map((r) =>
		r.kind === "group"
			? `${"  ".repeat(r.depth)}[${r.bus.id}${r.collapsed ? " -" : ""}]`
			: `${"  ".repeat(r.depth)}${r.track.id}`,
	);

describe("studioRows", () => {
	const buses = [
		bus("drums", { folder: true }),
		bus("kit", { folder: true, output: "drums" }),
		bus("fx"),
	];
	const tracks = [
		track("vox"),
		track("kick", "kit"),
		track("snare", "kit"),
		track("room", "drums"),
		track("bass", "fx"),
	];
	it("opens a group where its first track sits, nests a group in a group, and leaves a plain bus's track alone", () => {
		expect(shape(studioRows({ tracks, buses }))).toEqual([
			"vox",
			"[drums]",
			"  [kit]",
			"    kick",
			"    snare",
			"  room",
			"bass",
		]);
	});
	it("collapses a group to its row, inner groups with it", () => {
		expect(shape(studioRows({ tracks, buses }, { drums: true }))).toEqual([
			"vox",
			"[drums -]",
			"bass",
		]);
		expect(shape(studioRows({ tracks, buses }, { kit: true }))).toEqual([
			"vox",
			"[drums]",
			"  [kit -]",
			"  room",
			"bass",
		]);
	});
	it("gathers a group's tracks even when others sit between them in the list", () => {
		const spread = [track("kick", "drums"), track("vox"), track("snare", "drums")];
		// The empty inner group comes at the end, under its parent.
		expect(shape(studioRows({ tracks: spread, buses }))).toEqual([
			"[drums]",
			"  kick",
			"vox",
			"  snare",
			"  [kit]",
		]);
	});
	it("puts an empty group last, and cuts a circle of outputs", () => {
		const empty = [bus("new", { folder: true })];
		expect(shape(studioRows({ tracks: [track("vox")], buses: empty }))).toEqual(["vox", "[new]"]);
		const loop = [bus("a", { folder: true, output: "b" }), bus("b", { folder: true, output: "a" })];
		expect(shape(studioRows({ tracks: [track("t", "a")], buses: loop }))).toEqual([
			"[b]",
			"  [a]",
			"    t",
		]);
	});
});
