import type { PendingKind, PendingState } from "#lib/constants/dashboardActivity.js";

const KIND: Record<PendingKind, string> = {
	stem: "the stem",
	demo: "the demo",
	mix: "the mix",
	"session-recording": "the recording",
	"song-mix": "the stem mix",
	notes: "the notes transcription",
	notation: "the notation PDF",
};

/** The line under a pending item's title: its state and what it is ("Rendering the demo Rough", "Upload not finished: the stem Bass", "Playback failed for the mix v2"). */
export function pendingText(p: { kind: PendingKind; state: PendingState; label: string }): string {
	const what = `${KIND[p.kind]} ${p.label}`.trim();
	switch (p.state) {
		case "uploading":
			return `Upload not finished: ${what}`;
		case "rendering":
			return `Rendering ${what}`;
		case "failed":
			return `Playback failed for ${what}`;
	}
}
