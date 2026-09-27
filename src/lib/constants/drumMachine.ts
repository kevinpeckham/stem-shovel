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

/**
 * Steps to the pattern, sixteenths: half a bar, a bar or two bars of 4/4
 * (8, 16, 32), a bar or two of 3/4 or 6/8 (12, 24). The order is what a
 * share link encodes (version 3 on); it only ever grows at the end.
 */
export const DRUM_STEP_CHOICES = [8, 16, 32, 12, 24] as const;
export type DrumSteps = (typeof DRUM_STEP_CHOICES)[number];
/** What version 1 and 2 links could say, in their order. */
export const DRUM_STEP_CHOICES_V2 = [8, 16, 32] as const;

/** The meter names the bar: how many sixteenths it holds and how they group for the grid's shading. */
export const DRUM_METERS = [
	{ id: "4/4", label: "4/4", barSteps: 16, group: 4 },
	{ id: "3/4", label: "3/4", barSteps: 12, group: 4 },
	{ id: "6/8", label: "6/8", barSteps: 12, group: 6 },
] as const;
export type DrumMeterId = (typeof DRUM_METERS)[number]["id"];
export const DRUM_METER_IDS = DRUM_METERS.map((m) => m.id) as DrumMeterId[];
/** The step counts a meter allows: half a bar (4/4 only), a bar, two bars. */
export function drumStepsFor(meter: DrumMeterId): DrumSteps[] {
	const bar = DRUM_METERS.find((m) => m.id === meter)!.barSteps;
	const choices: number[] = meter === "4/4" ? [bar / 2, bar, bar * 2] : [bar, bar * 2];
	return choices.filter((n): n is DrumSteps =>
		(DRUM_STEP_CHOICES as readonly number[]).includes(n),
	);
}

export const DRUM_BPM_MIN = 40;
export const DRUM_BPM_MAX = 240;
export const MAX_DRUM_ROWS = 12;
/** A cell holds a velocity: 0 silent, 1 ghost, 2 normal, 3 accent. Phase 1 toggles 0 and 2. */
export const DRUM_VELOCITY_MAX = 3;
export const DRUM_VELOCITY_NORMAL = 2;
/** Patterns to a project: the tabs above the grid. */
export const MAX_DRUM_PATTERNS = 8;
/** Humanize at full strength scatters a hit this far in time, either way, and a quarter of its gain. */
export const DRUM_HUMANIZE_MS = 12;
/**
 * The share-link format's version, the first byte of every link. Version 1
 * carried one pattern with the tempo inside it; version 2 carries a project
 * of patterns with pan per row and humanize; version 3 adds a meter and
 * the 3/4 and 6/8 step counts. A reader keeps a branch for every version
 * there has been.
 */
export const DRUM_PATTERN_VERSION = 3;
/** General MIDI drum notes, for the MIDI export (channel 10). */
export const DRUM_GM_NOTES: Record<DrumVoiceId, number> = {
	kick: 36,
	snare: 38,
	"hat-closed": 42,
	"hat-open": 46,
	clap: 39,
	rim: 37,
	"tom-low": 45,
	"tom-mid": 47,
	"tom-high": 50,
	ride: 51,
	crash: 49,
	cowbell: 56,
};
