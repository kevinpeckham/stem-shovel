import type { ConfidenceRecord, TimingMap } from "@barmark/sync";

/**
 * A draft's confidence record when it can be kept beside `map`: the
 * builder's shape (`format: "barmark-confidence"`, `version: 1`) with one
 * entry per played bar the map covers; anything else is null.
 */
export function checkedConfidence(value: unknown, map: TimingMap): ConfidenceRecord | null {
	if (!value || typeof value !== "object") return null;
	const c = value as Partial<ConfidenceRecord>;
	if (c.format !== "barmark-confidence" || c.version !== 1 || !Array.isArray(c.bars)) return null;
	return c.bars.length === map.chart.bars ? (c as ConfidenceRecord) : null;
}
