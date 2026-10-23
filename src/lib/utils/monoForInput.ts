import type { StudioTrack } from "#lib/val/StudioSchema.js";

/**
 * Whether an armed track should follow its input's channel count
 * (docs/multitrack-recorder.md "Mono tracks"): a track with nothing on
 * it yet takes the input's shape (one channel: mono; both: stereo) when
 * it is armed or its input changes while armed, so a bass on the left
 * input records onto a mono track without a visit to the mixer. A track
 * that holds clips is left as it is, whatever the input, since its
 * recordings may be of either kind and a change would move their level.
 * Returns the `mono` the track should have, or null to leave it alone.
 */
export function monoForInput(
	track: Pick<StudioTrack, "kind" | "armed" | "input" | "mono">,
	hasClips: boolean,
): boolean | null {
	if (!track.armed || !track.input || hasClips) return null;
	if (track.kind === "midi") return null;
	const mono = track.input.channel !== "stereo";
	return mono === !!track.mono ? null : mono;
}
