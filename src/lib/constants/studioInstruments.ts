import type { StudioInputSource } from "#lib/val/StudioSchema.js";

/**
 * The instruments Dawn hosts (docs/dawn-daw-plan.md, D6): a MIDI track's
 * input is one of these, and an audio track may record one too. Each has
 * an adapter in `src/lib/audio/instruments.ts`; this list is what the
 * schema and the pickers read.
 */
export const STUDIO_INSTRUMENTS = ["piano", "chords", "drums", "sampler"] as const;
export type StudioInstrument = (typeof STUDIO_INSTRUMENTS)[number];
export const isInstrument = (s: string): s is StudioInstrument =>
	(STUDIO_INSTRUMENTS as readonly string[]).includes(s);

export const STUDIO_INPUT_LABELS: Record<StudioInputSource, string> = {
	mic: "Microphone",
	line: "Line in",
	computer: "Computer",
	piano: "Piano",
	chords: "Chord player",
	drums: "Drum machine",
	sampler: "Sampler",
	amp: "Practice amp",
};

/** A new sampler track's envelope, before a recording is chosen. */
export const SAMPLER_DEFAULTS = { root: 60, attack: 0.005, release: 0.15, loop: false } as const;
