import type { SessionKind } from "../constants/sessionRecordings";
import { SESSION_KIND_LABELS } from "../constants/sessionRecordings";

/** The title a recording made in the app starts with: "Practice 7:42 PM", from the moment Record was pressed. */
export function sessionRecordingTitle(at: Date, kind: SessionKind): string {
	const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
	return `${SESSION_KIND_LABELS[kind]} ${time}`;
}
