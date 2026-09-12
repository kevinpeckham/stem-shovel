// Client-side Better Auth. No baseURL: it defaults to window.location.origin,
// which is right in dev (several origins) and in production.
import { createAuthClient } from "better-auth/svelte";

export const authClient = createAuthClient();
