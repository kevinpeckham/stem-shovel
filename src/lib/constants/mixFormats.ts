import { DEMO_ACCEPT, DEMO_FORMAT_LIST, DEMO_FORMATS } from "./demoFormats";

/** Mixes per song (docs/mixes.md): a long feedback loop, but not forever. */
export const MAX_MIXES_PER_SONG = 24;

/** A mix is whatever a DAW bounces: the demo formats, transcoded to MP3 for playback the same way. */
export const MIX_FORMATS = DEMO_FORMATS;
export const MIX_ACCEPT = DEMO_ACCEPT;
export const MIX_FORMAT_LIST = DEMO_FORMAT_LIST;

/** The engineer's notes on a mix, markdown. */
export const MIX_NOTES_MAX = 5000;
