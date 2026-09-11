/**
 * Single source of truth for colours.
 * Imported by uno.config.ts (for utility classes) AND by the canvas
 * waveform renderer, so both stay in sync.
 */
export const colors = {
	panel: "#E9E7E1", // page background — warm grey, like a console faceplate
	row: "#F6F5F1", // stem row surface
	ink: "#24262B", // primary text, active mute button
	dim: "#6B6E76", // secondary text
	line: "#D3D1CA", // hairline borders
	wave: "#3B3F47", // waveform when audible
	waveDim: "#C6C7CB", // waveform when muted / not soloed
	playhead: "#0E7C86", // playhead + play button
	solo: "#C77A0A", // active solo button
} as const;

export type ThemeColor = keyof typeof colors;
