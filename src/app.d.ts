// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: { id: string; name: string; email: string };
			/** Accounts the user belongs to; the URL's [account] must be one of them. */
			memberships: { accountId: string; slug: string; name: string; role: string }[];
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
