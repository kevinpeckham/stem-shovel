import { notifications, notify } from "#lib/state/notifications.svelte.js";

/**
 * A download the server builds on request (a documentation PDF, a charts
 * zip): fetched here rather than followed as a link, so the page can say
 * it is being prepared, hand the file to the browser when it arrives, and
 * show a failure as a notification instead of a bare error page (Kevin:
 * a slow zip looked like nothing was happening, then a 404). The filename
 * comes from the response's Content-Disposition, `fallback` otherwise.
 */
export async function downloadBuilt(url: string, label: string, fallback: string): Promise<void> {
	const id = notify(`Preparing ${label}…`, { kind: "info", timeout: null, dismissable: false });
	try {
		const res = await fetch(url, { credentials: "same-origin" });
		if (!res.ok) throw new Error(await failureText(res));
		const blob = await res.blob();
		const name = filenameOf(res.headers.get("content-disposition")) ?? fallback;
		const href = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = href;
		a.download = name;
		a.rel = "noopener";
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(href), 60_000);
		notifications.dismiss(id);
		notify(`${label} is downloading`);
	} catch (e) {
		notifications.dismiss(id);
		notify(`Could not prepare ${label}: ${e instanceof Error ? e.message : String(e)}`, {
			kind: "error",
		});
	}
}

/** The server's message when it answers with an error body (SvelteKit's `{ message }`), else the status. */
async function failureText(res: Response): Promise<string> {
	try {
		const data = (await res.json()) as { message?: string };
		if (data?.message) return data.message;
	} catch {
		// Not JSON: the status will do.
	}
	return `the server answered ${res.status}`;
}

/** `filename*=UTF-8''…` first, then `filename="…"`. */
function filenameOf(disposition: string | null): string | null {
	if (!disposition) return null;
	const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
	if (star) {
		try {
			return decodeURIComponent(star[1]);
		} catch {
			// Fall through to the plain name.
		}
	}
	const plain = /filename="([^"]+)"/i.exec(disposition);
	return plain ? plain[1] : null;
}
