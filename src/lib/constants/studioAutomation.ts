import { FADER_MAX } from "./fader";

/**
 * What a Dawn track can automate (docs/dawn-daw-plan.md, D1): the fader,
 * the pan and the reverb send, each a lane of breakpoints in the
 * parameter's own units. D2 registers every insert and send parameter
 * the same way.
 */
export const STUDIO_AUTOMATION_PARAMS = ["volume", "pan", "reverb"] as const;
export type StudioAutomationParam = (typeof STUDIO_AUTOMATION_PARAMS)[number];

export interface AutomationRange {
	label: string;
	min: number;
	max: number;
	/** What the parameter is without a lane: the lane's first point starts here. */
	initial: number;
	/** The value as a lane's readout says it. */
	format: (v: number) => string;
	/** The arc fills from the center (a pan) rather than the bottom. */
	bipolar?: boolean;
}

const db = (v: number) => (v <= 0 ? "−∞ dB" : `${(20 * Math.log10(v)).toFixed(1)} dB`);

export const STUDIO_AUTOMATION: Record<StudioAutomationParam, AutomationRange> = {
	volume: { label: "Volume", min: 0, max: FADER_MAX, initial: 1, format: db },
	pan: {
		label: "Pan",
		min: -1,
		max: 1,
		initial: 0,
		bipolar: true,
		format: (v) =>
			v === 0 ? "C" : v < 0 ? `L ${Math.round(-v * 100)}` : `R ${Math.round(v * 100)}`,
	},
	reverb: { label: "Reverb", min: 0, max: 1, initial: 0, format: (v) => `${Math.round(v * 100)}%` },
};

/** Breakpoints a lane may hold. */
export const MAX_AUTOMATION_POINTS = 1000;
/** Two points closer than this are one (a click on an existing point moves it rather than doubling it), seconds. */
export const AUTOMATION_MERGE_SECONDS = 0.02;
