import type { ActivityKind } from "#lib/constants/dashboardActivity.js";

/** The line under an activity event's title: who did what ("Pat added the stem Bass", "Sam edited the chart", "New song"). */
export function activityText(e: { kind: ActivityKind; who: string | null; label: string }): string {
	const who = e.who ?? "Someone";
	switch (e.kind) {
		case "stem":
			return `${who} added the stem ${e.label}`.trim();
		case "demo":
			return `${who} added the demo ${e.label}`.trim();
		case "mix":
			return `${who} added the mix ${e.label}`.trim();
		case "session-recording":
			return e.label ? `Recording added: ${e.label}` : "Recording added";
		case "doc":
			return `${who} edited the ${e.label}`;
		case "chat":
		case "session-chat":
			return `${who} wrote in the chat`;
		case "comment":
		case "session-comment":
			return `${who} commented`;
		case "song":
			return "New song";
		case "project":
			return "New project";
	}
}
