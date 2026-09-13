import { MIDI_FORMATS } from "$lib/constants/midiFormats";

/** "audio/midi" for a .mid / .midi filename, null otherwise. */
export function midiContentType(filename: string): string | null {
	const ext = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
	return ext ? (MIDI_FORMATS[ext] ?? null) : null;
}
