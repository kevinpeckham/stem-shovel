import { ENV } from "varlock/env";

/**
 * Production's own origin: the domain Vercel says is production
 * (`VERCEL_PROJECT_PRODUCTION_URL`, set on every stage), with the literal
 * as the fallback for a build outside Vercel. Better Auth's base URL in
 * production (src/lib/auth.ts), and where the short domain sends visitors
 * (src/hooks.server.ts; docs/environment.md "Short links").
 */
export const SITE_ORIGIN = ENV.VERCEL_PROJECT_PRODUCTION_URL
	? `https://${ENV.VERCEL_PROJECT_PRODUCTION_URL}`
	: "https://www.stemshovel.com";
