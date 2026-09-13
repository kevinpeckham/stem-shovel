/** How positions read and are typed: the transport's readout mode. */
export const POSITION_MODES = ["timecode", "bars"] as const;
export type PositionMode = (typeof POSITION_MODES)[number];
export const POSITION_MODE_LABELS: Record<PositionMode, string> = {
	timecode: "Timecode",
	bars: "Bars",
};
