import { SESSION_DEVICE_LABELS } from "../constants/sessionRecordings";
import type { SessionDevice } from "../val/SessionRecordingSchema";

/**
 * A session recording's input as one line (docs/uploads-and-blob.md,
 * "Sessions"): the device's label and the input's name together
 * ("Phone · Kevin's phone"), either alone when the other is unset, or ""
 * when neither is.
 */
export function recordingInputText(
	device: SessionDevice | null | undefined,
	source: string,
): string {
	return [SESSION_DEVICE_LABELS[device ?? ""] ?? "", source.trim()].filter(Boolean).join(" · ");
}
