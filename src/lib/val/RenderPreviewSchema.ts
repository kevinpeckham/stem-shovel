import * as v from "valibot";

/** Argument of the renderPreview query: a document's markdown and which rendering it gets (the chart's renderer, or markdown). */
export const RenderPreviewSchema = v.object({
	markdown: v.pipe(v.string(), v.maxLength(50_000)),
	kind: v.picklist(["chart", "text"]),
});
export type RenderPreview = v.InferOutput<typeof RenderPreviewSchema>;
