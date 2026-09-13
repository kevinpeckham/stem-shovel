/** "2024-03-09" → "March 2024" (a day is more than a songwriting date usually needs). */
export function formatMonth(isoDate: string): string {
	const [y, m] = isoDate.split("-").map(Number);
	if (!y || !m) return isoDate;
	return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
