// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** package.json's version, baked in at build (vite.config.ts `define`). */
	const __APP_VERSION__: string;
	/** Short commit sha of the build, or "" when unknown. */
	const __BUILD_SHA__: string;
	namespace App {
		// interface Error {}
		interface Locals {
			/** Signed-in user, or null. */
			user: {
				id: string;
				name: string;
				email: string;
				isSystemAdmin: boolean;
				isSuperAdmin: boolean;
				twoFactorEnabled: boolean;
			} | null;
			/** Accounts the user belongs to (empty when signed out). */
			/** Accounts the user belongs to; a super admin also carries every other account as an acting owner. */
			memberships: {
				accountId: string;
				slug: string;
				name: string;
				role: string;
				actingAs?: boolean;
			}[];
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};

/**
 * `@barmark/score`'s `scoreerror` (bubbles, composed) as an attribute on any
 * element above a `<barmark-score>`: svelte/elements knows the standard
 * events alone, so the custom one is declared here (ChartHtml.svelte).
 */
declare module "svelte/elements" {
	interface HTMLAttributes<T> {
		onscoreerror?: (
			event: CustomEvent<{ reason?: string }> & { currentTarget: EventTarget & T },
		) => void;
		/** `@barmark/score`'s `viewchange` (bubbles, composed): the view it now shows, from its own switch or from script. */
		onviewchange?: (
			event: CustomEvent<{ view?: string }> & { currentTarget: EventTarget & T },
		) => void;
	}
}
