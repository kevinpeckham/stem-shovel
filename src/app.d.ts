// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** Signed-in user, or null. */
			user: { id: string; name: string; email: string } | null;
			/** Accounts the user belongs to (empty when signed out). */
			memberships: { accountId: string; slug: string; name: string; role: string }[];
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
