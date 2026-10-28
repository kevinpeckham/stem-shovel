/**
 * Where a show or practice is, as one name: its venue's (a show), else its
 * practice location's, else the free text from before venues were rows;
 * "" when none of them says.
 */
export function eventPlace(e: {
	place?: { name: string } | null;
	location?: { name: string } | null;
	venue: string;
}): string {
	return (e.place?.name || e.location?.name || e.venue).trim();
}
