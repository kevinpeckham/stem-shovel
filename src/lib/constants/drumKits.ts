import type { DrumVoiceId } from "./drumMachine";

/**
 * Custom drum kits (docs/drum-machine.md, "Custom kits"): a kit is a set of
 * one-shot samples, one per voice, in Vercel Blob. The site's kits (no
 * account) are a system admin's and play for everyone; an account's kits
 * are its editors' and play for its members. The three built-in kits
 * (constants/drumMachine.ts) stay in the code.
 */
export const MAX_DRUM_KITS_PER_ACCOUNT = 20;
/** A one-shot is short: 10 MB covers a 24-bit stereo WAV of 30 seconds. */
export const DRUM_SAMPLE_MAX_BYTES = 10 * 1024 * 1024;

/** The built-in kits whose samples a system admin may replace drum by drum (the electronic kit is synthesized, nothing to replace). */
export const OVERRIDABLE_KITS = ["acoustic", "room"] as const;
export type OverridableKit = (typeof OVERRIDABLE_KITS)[number];
export const isOverridableKit = (id: string): id is OverridableKit =>
	(OVERRIDABLE_KITS as readonly string[]).includes(id);

/** A kit as the pages hand it to the drum machine: where each voice's file is (a voice with no file is silent; for a built-in kit, its own file). */
export interface DrumKitManifest {
	id: string;
	name: string;
	scope: "site" | "account";
	samples: Partial<Record<DrumVoiceId, string>>;
}
