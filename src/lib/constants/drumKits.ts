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

/** Where the built-in sampled kits' files come from (docs/drum-machine.md, "The samples and their attribution"): Groovie's CC0 one-shots, each renamed. */
export const BUILTIN_SAMPLES_SOURCE = "Groovie (CC0), https://github.com/maximecb/groovie";
export const BUILTIN_SAMPLE_FILES: Record<OverridableKit, Record<DrumVoiceId, string>> = {
	acoustic: {
		kick: "kick_01",
		snare: "snare_01",
		"hat-closed": "hat_closed_01",
		"hat-open": "hat_open_01",
		clap: "clap_01",
		rim: "rimshot_01",
		"tom-low": "tom_low_01",
		"tom-mid": "tom_mid_01",
		"tom-high": "tom_hi_01",
		ride: "ride_01",
		crash: "crash_01",
		cowbell: "cowbell_01",
	},
	room: {
		kick: "kick_12",
		snare: "snare_09",
		"hat-closed": "hat_closed_06",
		"hat-open": "hat_open_02",
		clap: "clap_02",
		rim: "rimshot_02",
		"tom-low": "tom_low_02",
		"tom-mid": "tom_mid_05",
		"tom-high": "tom_hi_05",
		ride: "ride_02",
		crash: "crash_02",
		cowbell: "cowbell_02",
	},
};

/** A kit as the pages hand it to the drum machine: where each voice's file is (a voice with no file is silent; for a built-in kit, its own file). */
export interface DrumKitManifest {
	id: string;
	name: string;
	scope: "site" | "account";
	samples: Partial<Record<DrumVoiceId, string>>;
}
