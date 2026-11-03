import { parseChart } from "barmark";
import { chartDiagnosticText } from "./chartDiagnosticText.js";
import { chartReadWarnings } from "./chartReadWarnings.js";

/**
 * What a member sees in amber over a score's read while editing it: the
 * signs of a bad read (`chartReadWarnings`), then barmark's errors, each as
 * "Line n: message (token)" (a line with an error plays nothing). Once
 * each, in order; empty for a clean read. barmark's warnings are left out.
 */
export function chartReadIssues(text: string): string[] {
	const errors = parseChart(text)
		.diagnostics.filter((d) => d.severity === "error")
		.map(chartDiagnosticText);
	return [...new Set([...chartReadWarnings(text), ...errors])];
}
