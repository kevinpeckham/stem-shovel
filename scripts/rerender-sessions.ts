/**
 * Lists a stage's session recordings with the state and size of their MP3
 * and, with --apply, clears the rendition of the ones named (or of every
 * one with --all) so they render again on the current code: leveled and
 * declipped since v0.171.0 (docs/uploads-and-blob.md, "Leveling"). A
 * failed rendition is cleared too, with its attempt time, so the next
 * visit retries at once instead of waiting out the hourly retry
 * (`PLAYBACK_RETRY_MS`; Kevin, 2026-10-28, a 650 MB FLAC that failed before
 * v0.195.0 streamed big sources). The sources stay as uploaded. A script cannot post to the jobs function from
 * outside the site (the firewall answers 429; FINDINGS.md 2026-10-26), so
 * the cleared rows are rendered when the account's Sessions page is next
 * opened (`sessionsWantingPlayback`); open it after this.
 *
 *   bun run db:rerender-sessions                       # list
 *   bun run db:rerender-sessions -- --apply <id> <id>  # clear those
 *   bun run db:rerender-sessions -- --apply --all      # clear every one, failed included
 *
 * Run against the stage whose database the environment resolves: on a
 * machine without that stage's secrets, varlock falls back to another
 * stage's without a word (FINDINGS.md 2026-10-26), so the host is printed
 * first. No import of src/lib/server (it pulls in $app/*).
 */
import { createClient } from "@libsql/client";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const all = args.includes("--all");
const ids = args.filter((a) => !a.startsWith("--"));

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN)
	throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are needed");
console.log(`database: ${new URL(TURSO_DATABASE_URL.replace(/^libsql:/, "https:")).hostname}`);
const db = createClient({ url: libsqlUrl(TURSO_DATABASE_URL), authToken: TURSO_AUTH_TOKEN });

interface Row {
	id: string;
	title: string;
	filename: string;
	playback_status: string | null;
	size_bytes: number | null;
	duration_seconds: number | null;
	created_at: number;
	session_name: string | null;
	starts_on: string | null;
	place: string | null;
	account: string | null;
}
const rows = (
	await db.execute(
		`select r.id, r.title, r.filename, r.playback_status, r.size_bytes, r.duration_seconds, r.created_at,
		        s.name as session_name, s.starts_on, s.place, a.slug as account
		 from session_recording r
		 left join recording_session s on s.id = r.session_id
		 left join account a on a.id = r.account_id
		 where r.status = 'ready'
		 order by s.starts_on desc, r.created_at`,
	)
).rows as unknown as Row[];
if (rows.length === 0) {
	console.log("No session recordings.");
	process.exit(0);
}
const minutes = (s: number | null) => (s === null ? "?" : `${Math.round(s / 60)} min`);
const megabytes = (b: number | null) => (b === null ? "?" : `${Math.round(b / 1048576)} MB`);
for (const r of rows) {
	const session =
		r.session_name || [r.place, r.starts_on].filter(Boolean).join(" · ") || "(no session)";
	console.log(
		`${r.id}  /${r.account ?? "?"}  ${session}  —  ${r.title || r.filename}  ${minutes(r.duration_seconds)}  ${megabytes(r.size_bytes)}  mp3: ${r.playback_status ?? "none"}`,
	);
}
if (!apply) {
	console.log(
		`\n${rows.length} recording(s); run with --apply <id…> or --apply --all to re-render.`,
	);
	process.exit(0);
}
const chosen = all ? rows : rows.filter((r) => ids.includes(r.id));
const unknown = ids.filter((id) => !rows.some((r) => r.id === id));
if (unknown.length) console.log(`not found: ${unknown.join(", ")}`);
if (chosen.length === 0) {
	console.log("Nothing chosen: name ids after --apply, or pass --all.");
	process.exit(1);
}
let cleared = 0;
for (const r of chosen) {
	const res = await db.execute({
		sql: `update session_recording set playback_status = null, playback_started_at = null
		      where id = ? and playback_status in ('ready', 'failed')`,
		args: [r.id],
	});
	cleared += res.rowsAffected;
}
const accounts = [...new Set(chosen.map((r) => r.account).filter(Boolean))];
console.log(
	`\nCleared ${cleared} rendition(s). Open ${accounts.map((a) => `/${a}/sessions`).join(" and ")} on this stage to start the renders; each MP3 shows again as it finishes.`,
);
