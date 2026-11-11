import * as v from "valibot";

/**
 * How a chart's sections size their columns (`song.chart_columns`,
 * `@barmark/render`'s `columns` option): `shared`, the default, aligns bar
 * lines down a section with the widest bar setting its column in every
 * row; `row` sizes each row's cells on its own, so one busy bar widens only
 * its own row. A member picks it in the Chart panel's ⋯ menu; null in the
 * database is `shared`.
 */
export const CHART_COLUMNS = ["shared", "row"] as const;
export const ChartColumnsSchema = v.picklist(CHART_COLUMNS);
export type ChartColumns = v.InferOutput<typeof ChartColumnsSchema>;
