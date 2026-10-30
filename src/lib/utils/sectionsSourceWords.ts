/** How the Sections tab names an offered answer: what it came from, and what its sections are. */
export function sectionsSourceWords(
	source: "ai" | "chart",
	hasScore: boolean,
): { from: string; ones: string } {
	if (source === "chart") return { from: "the chart", ones: "placed" };
	return { from: hasScore ? "the AI and the chart" : "the AI", ones: "detected" };
}
