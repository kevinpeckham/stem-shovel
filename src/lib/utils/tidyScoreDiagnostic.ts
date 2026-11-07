/**
 * A @barmark/musicxml import diagnostic's message for the draft card and the
 * "Nothing to chart" notice: the package writes for its command line too, and
 * its hint to import a part as note sets names a flag the app has no
 * control for (the `part` option is not exposed).
 */
export function tidyScoreDiagnostic(message: string): string {
	return message
		.replace(/[.;,]?\s*Import one as note sets with --part\.?$/i, ".")
		.replace(/\.\.$/, ".");
}
