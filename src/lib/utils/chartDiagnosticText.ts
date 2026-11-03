import type { ChartDiagnostic } from "barmark";

/** A barmark diagnostic as one line a member reads: "Line 3: message (token) → suggestion". */
export function chartDiagnosticText(d: ChartDiagnostic): string {
	const base = `Line ${d.line}: ${d.message} (${d.token})`;
	return d.suggestion ? `${base} → ${d.suggestion}` : base;
}
