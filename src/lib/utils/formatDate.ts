/** A Date → "Sep 13, 2026". */
export function formatDate(date: Date): string {
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
