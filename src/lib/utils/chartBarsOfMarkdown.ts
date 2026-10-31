import { barmarkChartBars } from "./barmarkChartBars.js";
import type { ChartBars } from "./chartBars.js";
import { chordChartBars } from "./chordChartBars.js";

const LEGACY_WARNING =
	"This chart is in the old notation and will be migrated to barmark; see /docs/writing-a-chord-chart";

/**
 * A band's markdown chord chart as the bars it plays: barmark first
 * (`barmarkChartBars`). When barmark reads no bars but the old in-app
 * parser (`chordChartBars`) does, the chart is in the old idiom and that
 * read is used, with a warning saying so. The fallback is transitional:
 * it goes once the stored charts are migrated to barmark
 * (docs/barmark-adoption-plan.md, Scope 2). Null when neither reads bars
 * (or there is no tempo).
 */
export function chartBarsOfMarkdown(
	markdown: string,
	defaults: { tempo: number | null; meter: string | null },
): ChartBars | null {
	const read = barmarkChartBars(markdown, defaults);
	if (read && read.bars.length > 0) return read;
	const legacy = chordChartBars(markdown, defaults);
	if (legacy && legacy.bars.length > 0) {
		return { bars: legacy.bars, warnings: [LEGACY_WARNING, ...legacy.warnings] };
	}
	return read;
}
