import { vi } from "vite-plus/test";

/**
 * A stand-in for a SvelteKit remote `form` in component tests: the spread
 * attributes, `enhance()`, `fields.<name>.as()/set()/issues()` (and an
 * array's `fields.<name>[i]`), `for()`,
 * `pending` and `result`. Nothing is submitted; `submit` is a spy so a test
 * can assert what the component would have sent.
 */
export function fakeRemoteForm(result?: unknown) {
	const attrs = { method: "POST", action: "/fake" };
	// An array field's items are fields too (`fields.mentions[0]`).
	const field = (name: string): Record<string, unknown> =>
		new Proxy(
			{
				as: (type: string, value?: string) => ({ name, type, value: value ?? "" }),
				set: vi.fn(),
				value: () => undefined,
				issues: () => undefined,
			},
			{
				get: (target, prop) =>
					typeof prop === "string" && /^\d+$/.test(prop)
						? field(`${name}[${prop}]`)
						: target[prop as keyof typeof target],
			},
		);
	const fields = new Proxy(
		{ allIssues: () => undefined, set: vi.fn() },
		{
			// Symbols arrive when Svelte stringifies a spread attribute; they are not fields.
			get: (target, prop) =>
				typeof prop !== "string"
					? undefined
					: prop in target
						? target[prop as keyof typeof target]
						: field(prop),
		},
	);
	const form: Record<string, unknown> = {
		...attrs,
		fields,
		pending: 0,
		result,
		submit: vi.fn(async () => true),
		enhance: (
			cb: (opts: { submit: () => Promise<unknown>; element: HTMLFormElement }) => Promise<void>,
		) => ({
			...attrs,
			onsubmit: async (e: Event) => {
				e.preventDefault();
				await cb({
					submit: form.submit as () => Promise<unknown>,
					element: e.currentTarget as HTMLFormElement,
				});
			},
		}),
	};
	form.for = () => form;
	return form;
}
