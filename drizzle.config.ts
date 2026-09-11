import { defineConfig } from "drizzle-kit";

// Runs outside Vite, so values come from `varlock run` (see package.json db:* scripts).
const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL) throw new Error("TURSO_DATABASE_URL is not set (run via `varlock run`)");
if (!TURSO_AUTH_TOKEN) throw new Error("TURSO_AUTH_TOKEN is not set (run via `varlock run`)");

export default defineConfig({
	dialect: "turso",
	schema: "./src/lib/server/db/schema/index.ts",
	out: "./drizzle",
	dbCredentials: { url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN },
	verbose: true,
	strict: true,
});
