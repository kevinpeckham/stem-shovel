import { dayText } from "./sessionName";

/**
 * A show or practice named in a line of text ("Part of …" on a session):
 * its title, else its venue, else "the show" or "the practice", then the
 * day ("The Echo · Oct 18, 2026").
 */
export function eventLabel(ev: {
	title: string;
	venue: string;
	kind: string;
	startsOn: string;
}): string {
	const noun = ev.kind === "show" ? "the show" : "the practice";
	return `${ev.title || ev.venue || noun} · ${dayText(ev.startsOn)}`;
}
