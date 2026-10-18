import type { StudioInsert, StudioTrackFx } from "#lib/val/StudioSchema.js";

/**
 * A track's fixed three effects from before D2 (`fx`: compressor, tone,
 * reverb, docs/multitrack-recorder.md phase 2b) as the insert list the
 * engine builds now: the ones doing something, in the chain's old order,
 * with ids a lane can name. A track with an `inserts` list uses that
 * instead (`insertsOf`), so an old arrangement plays as it did and the
 * first edit in the panel writes the list.
 */
export function insertsFromFx(fx: StudioTrackFx | undefined): StudioInsert[] {
	if (!fx) return [];
	const out: StudioInsert[] = [];
	if (fx.compressor.amount > 0)
		out.push({ id: "fx-compressor", kind: "compressor", settings: { ...fx.compressor } });
	if (fx.tone.tilt !== 0 || fx.tone.air > 0 || fx.tone.bottom > 0)
		out.push({ id: "fx-tone", kind: "tone", settings: { ...fx.tone } });
	if (fx.reverb.level > 0)
		out.push({ id: "fx-reverb", kind: "reverb", settings: { ...fx.reverb } });
	return out;
}

/** The inserts a track (or a bus, or the master) carries: its list, else its old `fx`. */
export function insertsOf(owner: { inserts?: StudioInsert[]; fx?: StudioTrackFx }): StudioInsert[] {
	return owner.inserts ?? insertsFromFx(owner.fx);
}
