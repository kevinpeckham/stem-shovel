import type { ActivityKind } from "#lib/constants/dashboardActivity.js";

/** What removing an activity event deletes, in a sentence ("Remove this stem…"): a doc event is one version of the chart, lyrics or notes. */
export function activityNoun(e: { kind: ActivityKind; label: string }): string {
	switch (e.kind) {
		case "doc":
			return `version of the ${e.label}`;
		case "session-recording":
			return "recording";
		case "chat":
		case "session-chat":
			return "chat message";
		case "session-comment":
			return "comment";
		default:
			return e.kind;
	}
}
