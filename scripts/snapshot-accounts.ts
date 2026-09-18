/**
 * Copies whole accounts out of the database varlock resolves (rows + every
 * file in Blob) into `.snapshots/<name>/`, so `restore-accounts.ts` can put
 * them into another stage (docs/environments.md). Read-only on the source.
 *
 *   bun run db:snapshot-accounts <name> [slug…]     # default slugs: mmkk sirrobert
 *
 * Rows go to rows.json (raw column names, insert order preserved), files to
 * files/<pathname> with a manifest of which row and column each belongs to.
 * Users are the members of those accounts, with their credentials and
 * two-factor rows, so they can sign in on the other stage as they do here.
 * Sessions, verification tokens, audit and bug-report rows are not copied.
 */
import { createClient, type Row } from "@libsql/client";
import { get } from "@vercel/blob";
import { createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { accessOfUrl, blobPathname } from "../src/lib/utils/blobAccess";

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, BLOB_PRIVATE_READ_WRITE_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) throw new Error("run via `varlock run`");
const [name, ...slugArgs] = process.argv.slice(2);
if (!name) throw new Error("usage: bun scripts/snapshot-accounts.ts <name> [slug…]");
const slugs = slugArgs.length ? slugArgs : ["mmkk", "sirrobert"];
const dir = join(".snapshots", name);
await mkdir(join(dir, "files"), { recursive: true });

const c = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });
const q = async (sql: string, args: (string | number)[] = []) =>
	(await c.execute({ sql, args })).rows;
const marks = (n: number) => Array(n).fill("?").join(",");
/** libsql types a cell as Value; ids and foreign keys are always text. */
const id = (v: unknown) => (typeof v === "string" ? v : String(v));

const accounts = await q(`select * from account where slug in (${marks(slugs.length)})`, slugs);
const missing = slugs.filter((s) => !accounts.some((a) => a.slug === s));
if (missing.length) throw new Error(`no account: ${missing.join(", ")}`);
const accountIds = accounts.map((a) => id(a.id));
const inAccounts = `account_id in (${marks(accountIds.length)})`;

/** Tables by account, in insert order (children after parents). */
const rows: Record<string, Row[]> = {};
rows.account = accounts;
rows.account_member = await q(`select * from account_member where ${inAccounts}`, accountIds);
const userIds = [...new Set(rows.account_member.map((m) => id(m.user_id)))];
rows.user = await q(`select * from user where id in (${marks(userIds.length)})`, userIds);
rows.auth_account = await q(
	`select * from auth_account where user_id in (${marks(userIds.length)})`,
	userIds,
);
rows.two_factor = await q(
	`select * from two_factor where user_id in (${marks(userIds.length)})`,
	userIds,
);
for (const t of [
	"project",
	"song",
	"stem",
	"demo",
	"recording",
	"comment",
	"share_link",
	"invitation",
	"invite_code",
]) {
	rows[t] = await q(`select * from "${t}" where ${inAccounts}`, accountIds);
}
const songIds = rows.song.map((s) => id(s.id));
rows.song_doc_version = songIds.length
	? await q(`select * from song_doc_version where song_id in (${marks(songIds.length)})`, songIds)
	: [];
rows.ai_request = songIds.length
	? await q(`select * from ai_request where song_id in (${marks(songIds.length)})`, songIds)
	: [];
rows.app_setting = await q("select * from app_setting");
// Users are parents of everything; put them first for the restore.
const ordered: Record<string, Row[]> = {};
for (const t of [
	"user",
	"auth_account",
	"two_factor",
	"account",
	"account_member",
	"project",
	"song",
	"stem",
	"demo",
	"recording",
	"comment",
	"share_link",
	"song_doc_version",
	"invitation",
	"invite_code",
	"ai_request",
	"app_setting",
]) {
	ordered[t] = rows[t] ?? [];
}

/** Every column that holds a Blob URL, and which privacy governs the file on restore. */
const FILE_COLUMNS: { table: string; columns: string[] }[] = [
	{ table: "stem", columns: ["url", "playback_url", "midi_url"] },
	{ table: "demo", columns: ["url", "playback_url"] },
	{ table: "song", columns: ["mix_url"] },
	{ table: "recording", columns: ["url", "playback_url"] },
];
interface FileEntry {
	table: string;
	id: string;
	column: string;
	pathname: string;
	access: "public" | "private";
	bytes: number;
}
const manifest: FileEntry[] = [];
let total = 0;
for (const { table, columns } of FILE_COLUMNS) {
	for (const row of ordered[table]) {
		for (const column of columns) {
			const url = row[column];
			if (typeof url !== "string" || !url.startsWith("https://")) continue;
			const pathname = blobPathname(url);
			if (!pathname)
				throw new Error(`${table}.${column} of ${id(row.id)} is not one of our stores: ${url}`);
			const access = accessOfUrl(url);
			const target = join(dir, "files", pathname);
			await mkdir(dirname(target), { recursive: true });
			let body: ReadableStream<Uint8Array> | null;
			if (access === "private") {
				if (!BLOB_PRIVATE_READ_WRITE_TOKEN) throw new Error("private file but no private token");
				const found = await get(url, {
					access: "private",
					useCache: false,
					token: BLOB_PRIVATE_READ_WRITE_TOKEN.trim(),
				});
				body = found?.stream ?? null;
			} else {
				const res = await fetch(url);
				body = res.ok ? res.body : null;
			}
			if (!body) throw new Error(`could not read ${url}`);
			await pipeline(Readable.fromWeb(body as never), createWriteStream(target));
			const bytes = (await stat(target)).size;
			total += bytes;
			manifest.push({ table, id: id(row.id), column, pathname, access, bytes });
			console.log(`${(total / 1e6).toFixed(0).padStart(5)} MB  ${pathname}`);
		}
	}
}

await writeFile(join(dir, "rows.json"), JSON.stringify(ordered, null, "\t"));
await writeFile(join(dir, "files.json"), JSON.stringify(manifest, null, "\t"));
const counts = Object.entries(ordered)
	.map(([t, r]) => `${t}=${r.length}`)
	.join(" ");
console.log(
	`snapshot ${name}: ${counts}; ${manifest.length} files, ${(total / 1e6).toFixed(0)} MB`,
);
