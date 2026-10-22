/**
 * MIDI expression lanes on a notes clip (docs/multitrack-recorder.md,
 * "Expression lanes"): a controller (CC), the pitch bend or the channel
 * pressure over the clip's content, as breakpoints held until the next
 * (MIDI's own way). Values are normalized 0..1 whatever the lane: a CC or
 * the pressure as value/127, the bend with 0.5 at center.
 */
export const STUDIO_LANE_KINDS = ["cc", "bend", "pressure"] as const;
export type StudioLaneKind = (typeof STUDIO_LANE_KINDS)[number];
/** Lanes a clip can hold: a handful of controllers is what a part ever rides. */
export const MAX_STUDIO_LANES = 8;
/** Points a lane can hold: a pedal pumps a few hundred times in a song; a wheel ride at MIDI's rate is thinned to this. */
export const MAX_STUDIO_LANE_POINTS = 1000;
/** How far a full pitch bend reaches, in semitones (the MIDI default: a whole tone). */
export const BEND_RANGE_SEMITONES = 2;
/** The controllers the roll offers by name; any other comes across from a file as "CC n". */
export const CC_NAMES: Record<number, string> = {
	1: "Modulation",
	2: "Breath",
	4: "Foot pedal",
	7: "Volume",
	10: "Pan",
	11: "Expression",
	64: "Sustain",
	66: "Sostenuto",
	67: "Soft pedal",
	74: "Brightness",
};
/** What the roll's "Add lane" menu lists, in order. */
export const LANE_CHOICES: { kind: StudioLaneKind; controller?: number }[] = [
	{ kind: "cc", controller: 64 },
	{ kind: "cc", controller: 1 },
	{ kind: "cc", controller: 11 },
	{ kind: "cc", controller: 2 },
	{ kind: "cc", controller: 4 },
	{ kind: "cc", controller: 74 },
	{ kind: "bend" },
	{ kind: "pressure" },
];
/** A lane's value when nothing sets it: the bend at center, a controller or the pressure at zero. */
export const laneDefault = (kind: StudioLaneKind): number => (kind === "bend" ? 0.5 : 0);
