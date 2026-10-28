const DAY = 24 * 60 * 60 * 1000;

/** A `YYYY-MM-DD` day as a UTC midnight, for counting whole days between two. */
const utcDay = (day: string) => {
	const [y, m, d] = day.split("-").map(Number);
	return Date.UTC(y, m - 1, d);
};

/**
 * How far off a day is, from today (both `YYYY-MM-DD`): "Today", "Tomorrow",
 * "In 3 days", then whole weeks from a week ("In 2 weeks"), then months of
 * thirty days from four weeks ("In 2 months"), each rounded down. A day
 * already past reads "Today": the dashboard lists nothing earlier.
 */
export function countdownText(startsOn: string, today: string): string {
	const days = Math.round((utcDay(startsOn) - utcDay(today)) / DAY);
	if (days <= 0) return "Today";
	if (days === 1) return "Tomorrow";
	if (days < 7) return `In ${days} days`;
	if (days < 28) {
		const weeks = Math.floor(days / 7);
		return weeks === 1 ? "In a week" : `In ${weeks} weeks`;
	}
	const months = Math.floor(days / 30);
	return months <= 1 ? "In a month" : `In ${months} months`;
}
