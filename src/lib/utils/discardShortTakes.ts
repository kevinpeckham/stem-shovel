/**
 * Whether the Idea Recorder drops a take shorter than `SHORT_TAKE_SECONDS`
 * (a mis-tap on Record) instead of saving it. Off by default, since it
 * throws a take away (Kevin's rule for destructive settings); the checkbox
 * in Recorder settings turns it on, remembered per browser (localStorage).
 */
const KEY = "stemshovel.discardShortTakes";

export const SHORT_TAKE_SECONDS = 3;

export function loadDiscardShortTakes(): boolean {
	try {
		return localStorage.getItem(KEY) === "true";
	} catch {
		return false;
	}
}

export function saveDiscardShortTakes(on: boolean): void {
	try {
		localStorage.setItem(KEY, String(on));
	} catch {
		// Private mode or a full store: the choice lasts for this page only.
	}
}
