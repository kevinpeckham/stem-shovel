import { notify } from "#lib/state/notifications.svelte.js";
import { errorMessage } from "./errorMessage";

const SITE = { title: "Stem Shovel", url: "https://www.stemshovel.com" };

/** Shares Stem Shovel's address through the system share sheet, or copies it where there is none. Dismissing the sheet is not an error. */
export async function shareSite(): Promise<void> {
	try {
		if (typeof navigator.share === "function") {
			await navigator.share(SITE);
			return;
		}
		await navigator.clipboard.writeText(SITE.url);
		notify("Link copied");
	} catch (e) {
		if (e instanceof DOMException && e.name === "AbortError") return;
		notify(`Could not share the link: ${errorMessage(e)}`, { kind: "error" });
	}
}
