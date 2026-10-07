/**
 * The message to show a person for a caught value. SvelteKit's remote functions throw an
 * `HttpError` for `error(status, message)` that is not an `Error` (its `toString` is the
 * JSON body), so `String(e)` would show `{"message":"…"}`.
 */
export const SESSION_ENDED = "Your session has ended. Sign in again to keep working.";

export function errorMessage(e: unknown, fallback = "Something went wrong"): string {
	if (e instanceof Error) return e.message || fallback;
	if (typeof e === "string") return e || fallback;
	if (e && typeof e === "object") {
		// A remote function's 401 (requireUser, requireMember): the session expired under the page.
		if ((e as { status?: unknown }).status === 401) return SESSION_ENDED;
		const body = (e as { body?: unknown }).body;
		if (body && typeof body === "object" && "message" in body) {
			const message = (body as { message?: unknown }).message;
			if (typeof message === "string" && message) return message;
		}
		const message = (e as { message?: unknown }).message;
		if (typeof message === "string" && message) return message;
	}
	return fallback;
}
