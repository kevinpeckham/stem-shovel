/**
 * Where a Directions link goes: the place's own map link, else a Google Maps
 * search of its name, address and city (the parts that are set), else ''.
 */
export function directionsUrl(place: {
	mapUrl?: string | null;
	name?: string | null;
	address?: string | null;
	city?: string | null;
}): string {
	const mapUrl = place.mapUrl?.trim();
	if (mapUrl) return mapUrl;
	const parts = [place.name, place.address, place.city].map((s) => s?.trim()).filter(Boolean);
	return parts.length
		? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(", "))}`
		: "";
}
