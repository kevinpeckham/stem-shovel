/** Standard MIDI files, `.mid` or `.midi`. */
export const MIDI_FORMATS: Record<string, string> = { mid: "audio/midi", midi: "audio/midi" };

export const MIDI_ACCEPT = Object.keys(MIDI_FORMATS)
	.map((ext) => `.${ext}`)
	.join(",");

/** MIDI files are tiny; this is a sanity cap, not a quota. */
export const MIDI_MAX_BYTES = 5 * 1024 * 1024;
