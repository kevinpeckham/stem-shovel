import type { NudgeKind } from "#lib/constants/dashboardActivity.js";
import { formatDate } from "./formatDate";

/** The line under a nudge's title: why it is worth a look ("Not changed since Sep 29, 2026", "A chart but no recording yet", "No take yet"). */
export function nudgeText(n: { kind: NudgeKind; at: Date }): string {
	switch (n.kind) {
		case "stale":
			return `Not changed since ${formatDate(n.at)}`;
		case "chart-no-recording":
			return "A chart but no recording yet";
		case "idea-no-take":
			return "No take yet";
	}
}
