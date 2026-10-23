import { insertsOf } from "#lib/utils/insertsFromFx.js";
import { busDescendants } from "#lib/utils/busDescendants.js";
import type { StudioArrangement, StudioBus, StudioTrack } from "#lib/val/StudioSchema.js";
import { createStripGraph, type StripGraph } from "./stripGraph";

/**
 * Dawn's live signal graph (docs/dawn-daw-plan.md, D8: the engine in
 * modules): the master strip, a strip per bus and per track
 * (stripGraph.ts), kept in step with the arrangement and routed (a track
 * to its bus or the master with its sends, a bus to the master). The
 * engine owns one of these once its context is open and asks it for
 * strips by id; what a strip's fader should read and how its lanes
 * settle are the engine's business, handed in as hooks.
 */
export interface GraphHooks {
	gainOf(track: StudioTrack): number;
	busGainOf(bus: StudioBus): number;
	/** The strip's lanes at rest for this moment (the engine's automation settle). */
	settle(owner: StudioTrack | StudioBus, strip: StripGraph, now: number): void;
}

export class StudioGraph {
	readonly master: StripGraph;
	readonly buses = new Map<string, StripGraph>();
	readonly tracks = new Map<string, StripGraph>();
	constructor(
		private readonly ctx: AudioContext,
		private readonly hooks: GraphHooks,
		a: StudioArrangement,
	) {
		this.master = createStripGraph(ctx, { inserts: a.masterInserts ?? [], pan: 0 });
		this.master.fader.gain.value = a.master;
		this.master.route(ctx.destination);
	}
	/** A strip by its owner's id: a track's, a bus's, or the master's ("master"). */
	stripOf(ownerId: string): StripGraph | null {
		if (ownerId === "master") return this.master;
		return this.tracks.get(ownerId) ?? this.buses.get(ownerId) ?? null;
	}
	/** Every bus and track as a strip, routed; buses and tracks that are gone dropped. */
	ensureAll(a: StudioArrangement) {
		for (const id of Array.from(this.buses.keys()))
			if (!a.buses?.some((b) => b.id === id)) this.dropBus(id);
		for (const b of a.buses ?? []) this.ensureBus(a, b.id);
		for (const id of Array.from(this.tracks.keys()))
			if (!a.tracks.some((t) => t.id === id)) this.dropTrack(id);
		for (const t of a.tracks) this.ensureTrack(a, t.id);
		this.routeAll(a);
	}
	ensureBus(a: StudioArrangement, busId: string): StripGraph | null {
		const bus = a.buses?.find((b) => b.id === busId);
		if (!bus) return null;
		let strip = this.buses.get(busId);
		if (strip) return strip;
		strip = createStripGraph(this.ctx, { inserts: insertsOf(bus), pan: bus.pan });
		strip.fader.gain.value = this.hooks.busGainOf(bus);
		strip.route(this.master.input);
		this.buses.set(busId, strip);
		this.hooks.settle(bus, strip, this.ctx.currentTime);
		return strip;
	}
	dropBus(busId: string) {
		const strip = this.buses.get(busId);
		if (!strip) return;
		strip.dispose();
		this.buses.delete(busId);
	}
	ensureTrack(a: StudioArrangement, trackId: string): StripGraph | null {
		let strip = this.tracks.get(trackId);
		if (strip) return strip;
		const track = a.tracks.find((t) => t.id === trackId);
		// The fader, the volume lane, the inserts, the pan, the meter, then a bus or the master (stripGraph.ts).
		strip = createStripGraph(this.ctx, {
			inserts: track ? insertsOf(track) : [],
			pan: track?.pan ?? 0,
		});
		this.tracks.set(trackId, strip);
		if (track) {
			strip.fader.gain.value = this.hooks.gainOf(track);
			this.hooks.settle(track, strip, this.ctx.currentTime);
		}
		return strip;
	}
	/**
	 * Every track to its bus or the master, with its sends; every bus to its
	 * output bus (docs/multitrack-recorder.md "Folder tracks") or the master.
	 * A bus whose output would feed back into it goes to the master instead.
	 */
	routeAll(a: StudioArrangement) {
		const busInputs = new Map<string, AudioNode>();
		for (const [id, strip] of this.buses) busInputs.set(id, strip.input);
		for (const [id, strip] of this.buses) {
			const bus = a.buses?.find((b) => b.id === id);
			const to =
				bus?.output && !busDescendants(a.buses ?? [], id).has(bus.output)
					? busInputs.get(bus.output)
					: undefined;
			strip.route(to ?? this.master.input);
		}
		for (const t of a.tracks) {
			const strip = this.tracks.get(t.id);
			if (!strip) continue;
			strip.route((t.output && busInputs.get(t.output)) || this.master.input);
			strip.setSends(t.sends ?? [], busInputs, 0);
		}
	}
	dropTrack(trackId: string) {
		const strip = this.tracks.get(trackId);
		if (!strip) return;
		strip.dispose();
		this.tracks.delete(trackId);
	}
	dispose() {
		for (const id of Array.from(this.tracks.keys())) this.dropTrack(id);
		for (const id of Array.from(this.buses.keys())) this.dropBus(id);
		this.master.dispose();
	}
}
