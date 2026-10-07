import type { ClipSpan } from "./trimmedClip";

/**
 * A clip split at a time inside it (docs/multitrack-recorder.md, "Editing
 * clips"): the left part keeps the start and the fade-in, the right part
 * takes the rest of the source and the fade-out. Null when the cut would
 * fall within 10 ms of either end. The caller gives the right part its id.
 */
export function splitClipAt<C extends ClipSpan>(
	clip: C,
	at: number,
): { left: C; right: Omit<C, "fadeIn"> & { fadeIn: number } } | null {
	const margin = 0.01;
	if (at <= clip.start + margin || at >= clip.start + clip.duration - margin) return null;
	const round4 = (x: number) => Math.round(x * 10000) / 10000;
	const cut = round4(at - clip.start);
	return {
		left: { ...clip, duration: cut, fadeOut: 0, fadeIn: Math.min(clip.fadeIn, cut / 2) },
		right: {
			...clip,
			start: round4(at),
			offset: round4(clip.offset + cut),
			duration: round4(clip.duration - cut),
			fadeIn: 0,
			fadeOut: Math.min(clip.fadeOut, (clip.duration - cut) / 2),
		},
	};
}
