/**
 * The session tempo (docs/audio-engine.md, "One tempo for the page"): the
 * metronome's tempo is the clock every instrument follows unless it is
 * told not to, each at a ratio of it, so a half-time beat or a double-time
 * arpeggio keeps step with the rest.
 */
export const TEMPO_RATIOS = [
	{ id: 0.5, label: "Half-time", short: "½×" },
	{ id: 1, label: "With the session", short: "" },
	{ id: 2, label: "Double-time", short: "2×" },
] as const;
export type TempoRatio = (typeof TEMPO_RATIOS)[number]["id"];
export function tempoRatioOf(v: unknown): TempoRatio | null {
	return v === 0.5 || v === 1 || v === 2 ? v : null;
}
