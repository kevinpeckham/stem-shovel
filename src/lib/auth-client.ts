// Client-side Better Auth. No baseURL: it defaults to window.location.origin,
// which is right in dev (several origins) and in production.
import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/svelte";

export const authClient = createAuthClient({
	plugins: [
		twoFactorClient({
			// The sign-in page handles the redirect itself (keeping ?next); this is the fallback.
			onTwoFactorRedirect() {
				window.location.href = "/verify-2fa";
			},
		}),
	],
});
