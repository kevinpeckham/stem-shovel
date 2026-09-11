/**
 * Single source of truth for colours, imported by uno.config.ts (utility
 * classes) AND by the canvas waveform renderer, so both stay in sync.
 *
 * The palette is lightningjar.com's (see `lj` below, copied from its
 * uno.config): oxford blue ground, off-white text, maximum-yellow accent.
 * The semantic tokens the app's classes use (`bg-panel`, `text-dim`,
 * `bg-playhead`, …) are mapped onto it.
 */
export const lj = {
	accent: "#ebf92f",
	oxford: "hsl(217, 48%, 15%)",
	oxfordLight: "#21355B",
	oxfordDark: "hsl(217, 48%, 12%)",
	cornflower: "hsl(217, 45%, 30%)",
	middleBlue: "hsl(188, 55%, 64%)",
	androidGreen: "hsl(71, 82%, 43%)",
	yellowGreen: "hsl(71, 69%, 70%)",
	titaniumYellow: "hsl(58, 100%, 47%)",
	maximumYellow: "#ebf92f",
	cultured: "hsl(220, 20%, 97%)",
	offWhite: "hsl(240, 33%, 99%)",
	xanthous: "#f7b32b",
} as const;

export const colors = {
	panel: lj.oxford, // page background
	row: "rgba(255, 255, 255, 0.05)", // stem row / card surface on the oxford ground
	ink: "#f5f5f5", // primary text (neutral-100); active mute button
	dim: "#cbd5e1", // secondary text (slate-300)
	line: "rgba(255, 255, 255, 0.12)", // hairline borders
	wave: "#e2e8f0", // waveform when audible
	waveDim: "rgba(255, 255, 255, 0.22)", // waveform when muted / not soloed
	playhead: lj.maximumYellow, // playhead + play button + accent
	solo: lj.xanthous, // active solo button, warnings
} as const;

export type ThemeColor = keyof typeof colors;
