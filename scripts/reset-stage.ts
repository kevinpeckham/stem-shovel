/**
 * Rebuilds a disposable stage (dev or staging) from scratch: migrations,
 * the seed account and user, the user docs, the operator flags and the
 * Screenshot Bot (docs/environments.md). Refuses production.
 *
 *   bun run db:reset-stage                       # migrate + seed the stage varlock resolves (APP_ENV)
 *   bun run db:reset-stage -- --wipe             # drop every table first (CONFIRM=yes required)
 *   bun run db:reset-stage -- --admin you@x.com  # also flag that user system + super admin
 *   bun run db:reset-stage -- --restore <name>   # put .snapshots/<name> (accounts + files) in first
 *
 * Staging from the VM: APP_ENV=preview bun run db:reset-stage (loads .env.preview.local).
 * Everything runs through the existing scripts, so this stays a thin orchestrator.
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { spawnSync } from "node:child_process";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, APP_ENV } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) throw new Error("run via `varlock run`");
if (APP_ENV === "production") throw new Error("refusing to reset production");
// Belt and braces: the stage databases carry their stage in the name.
if (!/stem-shovel-(dev|stag(e|ing))/.test(TURSO_DATABASE_URL)) {
	throw new Error(`refusing: ${TURSO_DATABASE_URL} is not a dev or staging database`);
}

const args = process.argv.slice(2);
const wipe = args.includes("--wipe");
const adminAt = args.indexOf("--admin");
const admin = adminAt >= 0 ? args[adminAt + 1] : null;
const restoreAt = args.indexOf("--restore");
const restore = restoreAt >= 0 ? args[restoreAt + 1] : null;
const stage = APP_ENV ?? "development";

const client = createClient({ url: libsqlUrl(TURSO_DATABASE_URL), authToken: TURSO_AUTH_TOKEN });
const db = drizzle(client);

if (wipe) {
	if (process.env.CONFIRM !== "yes") throw new Error("--wipe needs CONFIRM=yes in the environment");
	const tables = await client.execute(
		"select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '_litestream%' and name not like '\\_\\_turso%' escape '\\'",
	);
	await client.execute("pragma foreign_keys = off");
	for (const row of tables.rows) {
		const name = row.name;
		if (typeof name === "string") await client.execute(`drop table if exists "${name}"`);
	}
	await client.execute("pragma foreign_keys = on");
	console.log(`wiped ${tables.rows.length} tables on ${stage}`);
}

console.log(`migrating ${stage}…`);
await migrate(db, { migrationsFolder: "drizzle" });

function run(script: string, ...scriptArgs: string[]) {
	const result = spawnSync("bun", [`scripts/${script}`, ...scriptArgs], {
		env: process.env,
		stdio: "inherit",
	});
	if (result.status !== 0) throw new Error(`${script} failed`);
}

// The snapshot's users (by their production ids) go in before the seed, which finds them by email.
if (restore) run("restore-accounts.ts", restore);
run("seed.ts");
run("seed-user-docs.ts");
if (admin) {
	run("system-admin.ts", admin);
	run("super-admin.ts", admin);
}
// The seed's account; the bot is admin there so screenshots and smoke tests can edit.
run("preview-bot.ts", "lightning-jar");
console.log(`${stage} is ready`);
