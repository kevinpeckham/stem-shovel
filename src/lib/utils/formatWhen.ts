import { formatDate } from "./formatDate";

/** A moment as the inbox shows it: "Sep 13, 2026 7:05 pm". */
export function formatWhen(d: Date): string {
	return `${formatDate(d)} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}`;
}
