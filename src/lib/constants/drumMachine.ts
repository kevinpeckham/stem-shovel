/**
 * The drum machine's fixed choices (docs/drum-machine.md). The voice ids
 * name the sample files of a kit (`static/kits/<kit>/<voice>.wav`) and the
 * synthesized voices; their order is what a share link encodes, so a voice
 * is only ever appended, never moved.
 */
export const DRUM_VOICES = [
	{ id: "kick", label: "Kick" },
	{ id: "snare", label: "Snare" },
	{ id: "hat-closed", label: "Closed hat" },
	{ id: "hat-open", label: "Open hat" },
	{ id: "clap", label: "Clap" },
	{ id: "rim", label: "Rim" },
	{ id: "tom-low", label: "Low tom" },
	{ id: "tom-mid", label: "Mid tom" },
	{ id: "tom-high", label: "High tom" },
	{ id: "ride", label: "Ride" },
	{ id: "crash", label: "Crash" },
	{ id: "cowbell", label: "Cowbell" },
] as const;
export type DrumVoiceId = (typeof DRUM_VOICES)[number]["id"];
export const DRUM_VOICE_IDS = DRUM_VOICES.map((v) => v.id) as DrumVoiceId[];

/** Kits, in share-link order too. */
export const DRUM_KITS = [
	{ id: "acoustic", label: "Acoustic" },
	{ id: "electronic", label: "Electronic" },
] as const;
export type DrumKitId = (typeof DRUM_KITS)[number]["id"];
export const DRUM_KIT_IDS = DRUM_KITS.map((k) => k.id) as DrumKitId[];

/** Steps to the pattern: half a bar, a bar, two bars of sixteenths in 4/4. */
export const DRUM_STEP_CHOICES = [8, 16, 32] as const;
export type DrumSteps = (typeof DRUM_STEP_CHOICES)[number];

export const DRUM_BPM_MIN = 40;
export const DRUM_BPM_MAX = 240;
export const MAX_DRUM_ROWS = 12;
/** A cell holds a velocity: 0 silent, 1 ghost, 2 normal, 3 accent. Phase 1 toggles 0 and 2. */
export const DRUM_VELOCITY_MAX = 3;
export const DRUM_VELOCITY_NORMAL = 2;
/** The share-link format's version, the first byte of every link. */
export const DRUM_PATTERN_VERSION = 1;
