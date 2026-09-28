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

/** Kits, in share-link order too (two bits: room for one more). Sampled kits have a folder under static/kits. */
export const DRUM_KITS = [
	{ id: "acoustic", label: "Acoustic" },
	{ id: "electronic", label: "Electronic" },
	{ id: "room", label: "Room" },
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
/**
 * What swing moves: every second sixteenth (16, the MPC's 1/16 swing) or
 * the off-beat eighths (8, for a beat with nothing on the sixteenths). In
 * share-link order.
 */
export const DRUM_SWING_GRIDS = [16, 8] as const;
export type DrumSwingGrid = (typeof DRUM_SWING_GRIDS)[number];
/**
 * The delay's time, in sixteenths, so it follows the tempo: an eighth, a
 * dotted eighth (the classic), a quarter, a dotted quarter, a half. In
 * share-link order.
 */
export const DRUM_DELAY_TIMES = [
	{ steps: 2, label: "1/8" },
	{ steps: 3, label: "1/8 dotted" },
	{ steps: 4, label: "1/4" },
	{ steps: 6, label: "1/4 dotted" },
	{ steps: 8, label: "1/2" },
] as const;
export type DrumDelayTime = (typeof DRUM_DELAY_TIMES)[number]["steps"];
export const DRUM_DELAY_STEPS = DRUM_DELAY_TIMES.map((d) => d.steps) as DrumDelayTime[];
/**
 * The effects a project starts with: on, with both returns at zero, so a
 * beat starts dry and the first master level someone raises is heard at
 * once, because every drum already sends a little (DEFAULT_DRUM_SENDS);
 * a dotted-eighth delay with a moderate feedback; a medium room. Kevin's
 * call: the master controls are found first, the sends later.
 */
export const DEFAULT_DRUM_FX = {
	enabled: true,
	delayTime: 3 as DrumDelayTime,
	delayFeedback: 0.4,
	delayReturn: 0,
	reverbSize: 0.5,
	reverbReturn: 0,
};
/** What each drum sends to the delay and the reverb until someone says otherwise: snares and claps wet, kicks dry, rims into the delay. */
export const DEFAULT_DRUM_SENDS: Record<DrumVoiceId, { delaySend: number; reverbSend: number }> = {
	kick: { delaySend: 0, reverbSend: 0.05 },
	snare: { delaySend: 0.15, reverbSend: 0.4 },
	"hat-closed": { delaySend: 0.1, reverbSend: 0.15 },
	"hat-open": { delaySend: 0.15, reverbSend: 0.25 },
	clap: { delaySend: 0.2, reverbSend: 0.45 },
	rim: { delaySend: 0.45, reverbSend: 0.2 },
	"tom-low": { delaySend: 0.1, reverbSend: 0.3 },
	"tom-mid": { delaySend: 0.1, reverbSend: 0.3 },
	"tom-high": { delaySend: 0.1, reverbSend: 0.3 },
	ride: { delaySend: 0.1, reverbSend: 0.3 },
	crash: { delaySend: 0.1, reverbSend: 0.35 },
	cowbell: { delaySend: 0.35, reverbSend: 0.15 },
};
/** What a new project and a preset without its own setting start at: enough scatter not to sound like a machine (Kevin's call). */
export const DEFAULT_HUMANIZE = 0.14;
/** Humanize at full strength scatters a hit this far in time, either way, and a quarter of its gain. */
export const DRUM_HUMANIZE_MS = 12;
/**
 * The share-link format's version, the first byte of every link. Version 1
 * carried one pattern with the tempo inside it; version 2 carries a project
 * of patterns with pan per row and humanize; version 3 adds a meter and
 * the 3/4 and 6/8 step counts; version 4 adds the swing grid; version 5
 * adds the effects (sends per row, delay and reverb settings). A reader
 * keeps a branch for every version there has been.
 */
export const DRUM_PATTERN_VERSION = 5;
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
