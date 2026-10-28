import type { SessionKind } from "#lib/constants/sessionRecordings.js";
import { dayText, sessionDisplayName } from "./sessionName";

/**
 * A session as the event page's "Link a session" picker lists it: its
 * display name, the day after a session's own name (the place-and-day
 * name already has it), and "(linked elsewhere)" when it is tied to
 * another event (linking it moves it here).
 */
export function sessionChoiceLabel(
	c: { name: string; place: string; kind: SessionKind; startsOn: string; eventId: string | null },
	eventId: string,
): string {
	const day = c.name.trim() ? ` · ${dayText(c.startsOn)}` : "";
	const elsewhere = c.eventId && c.eventId !== eventId ? " (linked elsewhere)" : "";
	return `${sessionDisplayName(c)}${day}${elsewhere}`;
}
