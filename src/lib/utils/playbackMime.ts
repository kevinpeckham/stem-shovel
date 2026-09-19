/**
 * The MIME type, with its codecs parameter, to ask a media element about
 * before playing a take's original: `canPlayType` needs the codec, since
 * ALAC and AAC share `audio/mp4`. Null for an unknown codec (a take from
 * before codecs were recorded), which means "play the rendition".
 */
export function playbackMime(codec: string | null): string | null {
	switch (codec) {
		case "alac":
			return 'audio/mp4; codecs="alac"';
		case "aac":
			return 'audio/mp4; codecs="mp4a.40.2"';
		case "flac":
			return "audio/flac";
		case "opus":
			return 'audio/webm; codecs="opus"';
		case "pcm":
			return 'audio/webm; codecs="pcm"';
		default:
			return null;
	}
}
