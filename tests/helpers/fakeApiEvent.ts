import { vi } from "vite-plus/test";
import type { FakeRequestEvent } from "./fakeRequestEvent";

/**
 * Calls an API route's handler (`src/routes/api/**\/+server.ts`) the way
 * SvelteKit would: with the locals an `as*` builder from fakeRequestEvent.ts
 * set, the request given and the route's params. `jsonPost` builds the
 * request; a string body is sent as it is, to send malformed JSON.
 */
export function jsonPost(path: string, body: unknown): Request {
	return new Request(`http://localhost${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

export function callRoute<E>(
	handler: (event: E) => Response | Promise<Response>,
	event: FakeRequestEvent,
	request: Request,
	params: Record<string, string> = {},
): Promise<Response> {
	const full = {
		...event,
		request,
		url: new URL(request.url),
		params,
		route: { id: "" },
		setHeaders: vi.fn(),
	};
	return Promise.resolve(handler(full as unknown as E));
}
