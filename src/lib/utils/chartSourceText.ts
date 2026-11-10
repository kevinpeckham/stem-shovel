import { formatDate } from "#lib/utils/formatDate.js";
import type { ChartSource } from "#lib/val/ChartSourceSchema.js";

/**
 * The Chart tab's line on where the chart came from (`song.chartSource`):
 * "Generated from the stems on Nov 10, 2026", or "From Lead sheet, read
 * Nov 10, 2026", saying so when the file has since been removed (`gone`).
 */
export function chartSourceText(source: ChartSource, gone = false): string {
	const date = formatDate(new Date(source.at));
	if (source.kind === "stems") return `Generated from the stems on ${date}`;
	const from = `From ${source.name || "a score"}, read ${date}`;
	return gone ? `${from}; the file is gone` : from;
}
