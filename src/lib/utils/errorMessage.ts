/**
 * The message to show a person for a caught value. SvelteKit's remote functions throw an
 * `HttpError` for `error(status, message)` that is not an `Error` (its `toString` is the
 * JSON body), so `String(e)` would show `{"message":"…"}`.
 */
export function errorMessage(e: unknown, fallback = "Something went wrong"): string {
	if (e instanceof Error) return e.message || fallback;
	if (typeof e === "string") return e || fallback;
	if (e && typeof e === "object") {
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
