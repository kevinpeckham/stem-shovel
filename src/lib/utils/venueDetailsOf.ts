import { directionsUrl } from "./directionsUrl.js";

/** What a venue's read-only details show (VenueDetails). */
export interface VenueDetailsShown {
	place: string;
	directions: string;
	website: string;
	contact: string;
	notes: string;
}

const joinPlace = (...parts: (string | null | undefined)[]) =>
	parts
		.map((s) => s?.trim() ?? "")
		.filter(Boolean)
		.join(", ");

/**
 * What an event's venue details show: the chosen venue's (address and city,
 * Directions, website, the account's contact and notes); with a venue picked
 * whose row this page lacks, nothing; with no venue at all, the free text from
 * before venues (null when that is empty too).
 */
export function venueDetailsOf(
	chosen: {
		address: string;
		city: string;
		mapUrl: string;
		name: string;
		websiteUrl: string;
		contact: string;
		notes: string;
	} | null,
	venueId: string,
	e: {
		venue?: string | null;
		address?: string | null;
		city?: string | null;
		mapUrl?: string | null;
		venueNotes?: string | null;
	},
): VenueDetailsShown | null {
	if (chosen)
		return {
			place: joinPlace(chosen.address, chosen.city),
			directions: directionsUrl(chosen),
			website: chosen.websiteUrl.trim(),
			contact: chosen.contact.trim(),
			notes: chosen.notes.trim(),
		};
	if (venueId) return null;
	const legacy = {
		place: joinPlace(e.venue, e.address, e.city),
		directions: directionsUrl({ ...e, name: e.venue }),
		website: "",
		contact: "",
		notes: e.venueNotes?.trim() ?? "",
	};
	return legacy.place || legacy.directions || legacy.notes ? legacy : null;
}
