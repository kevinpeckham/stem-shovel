/**
 * Finds recordings whose MP3 has sound on the left channel only — a phone's
 * mono microphone written to a stereo file with the right channel silent,
 * as iOS did through a MediaStreamAudioDestinationNode before the
 * recorder's stereo fill (static/worklets/stereo-fill.js, FINDINGS.md
 * 2026-10-26) — and, with --apply, clears their rendition and posts the
 * jobs that render it again, folded to mono (src/lib/server/transcode.ts
 * `leftOnly`). Session recordings, demos and Idea Recorder takes; the
 * sources stay as uploaded. Each MP3 is fetched and measured with ffmpeg's
 * astats, so a stage with many recordings takes a while.
 *
 *   bun run db:left-only                      # report only
 *   bun run db:left-only -- --apply           # clear and re-render
 *   bun run db:left-only -- --origin https://www.stemshovel.com --apply
 *
 * The jobs are posted to --origin, else https://$VERCEL_PROJECT_PRODUCTION_URL,
 * else the dev server. The stage's code must carry the fold already (a
 * re-render on the old code makes the same file again). The firewall's bot
 * protection answers a post from outside the site with a 429 (FINDINGS.md
 * 2026-10-26, "a script cannot post to the jobs function"): the status is
 * cleared all the same, and the pages schedule the render themselves
 * (the sessions page, a song's page, the Idea Recorder) on their next load,
 * so the script says which to open.
 *
 * No import of src/lib/server (it pulls in $app/*).
 */
import { createClient } from "@libsql/client";
import { get } from "@vercel/blob";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { createHmac } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { accessOfUrl } from "../src/lib/utils/blobAccess";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";
import { silentRightChannel } from "../src/lib/utils/silentRightChannel";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const originArg = args[args.indexOf("--origin") + 1];
const origin = (
	args.includes("--origin") && originArg
		? originArg
		: process.env.VERCEL_PROJECT_PRODUCTION_URL
			? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
			: "http://localhost:5173"
).replace(/\/$/, "");

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, BLOB_PRIVATE_READ_WRITE_TOKEN, BETTER_AUTH_SECRET } =
	process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN || !BETTER_AUTH_SECRET)
	throw new Error("TURSO_DATABASE_URL, TURSO_AUTH_TOKEN and BETTER_AUTH_SECRET are needed");
if (!ffmpegPath) throw new Error("ffmpeg-static has no binary for this platform");
const db = createClient({ url: libsqlUrl(TURSO_DATABASE_URL), authToken: TURSO_AUTH_TOKEN });

/** The tables with an MP3 rendition a browser's recording may have made, and the job that renders it. */
const TABLES = [
	{ table: "session_recording", label: "title", kind: "session-playback" },
	{ table: "demo", label: "filename", kind: "demo-playback" },
	{ table: "recording", label: "title", kind: "recording-playback" },
] as const;

async function download(url: string, target: string) {
	let body: ReadableStream<Uint8Array> | null;
	if (accessOfUrl(url) === "private") {
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
}

/** ffmpeg's astats report for the file (its stderr; the run exits 0). */
function astats(file: string): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			ffmpegPath!,
			[
				"-hide_banner",
				"-i",
				file,
				"-vn",
				"-af",
				"astats=measure_overall=none:measure_perchannel=Peak_level",
				"-f",
				"null",
				"-",
			],
			{ maxBuffer: 4 * 1024 * 1024 },
			(err, _stdout, stderr) => (err ? reject(err) : resolve(stderr)),
		);
	});
}

/** Posts the jobs; the status they answered when not 2xx (the firewall's 429 from outside the site). */
async function postJobs(kind: string, ids: string[]): Promise<number | null> {
	const token = createHmac("sha256", BETTER_AUTH_SECRET!).update("background-jobs").digest("hex");
	const res = await fetch(`${origin}/api/jobs`, {
		method: "POST",
		headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
		body: JSON.stringify({ kind, ids }),
	});
	return res.ok ? null : res.status;
}

/** Which page's load schedules the renders of a kind when the post does not reach the jobs function. */
const PAGE_OF: Record<string, string> = {
	"session-playback": "the account's Sessions page",
	"demo-playback": "the song's page",
	"recording-playback": "the Idea Recorder (signed in as the take's owner)",
};

const dir = await mkdtemp(join(tmpdir(), "left-only-"));
let found = 0;
const unposted: string[] = [];
try {
	for (const { table, label, kind } of TABLES) {
		const rows = await db.execute(
			`select id, ${label} as label, playback_url as url from ${table} where playback_status = 'ready' and playback_url is not null order by created_at`,
		);
		console.log(`${table}: ${rows.rows.length} rendition(s) to measure`);
		const hit: string[] = [];
		for (const row of rows.rows as unknown as { id: string; label: string | null; url: string }[]) {
			const { id, url } = row;
			const file = join(dir, `${table}-${id}.mp3`);
			try {
				await download(url, file);
				if (silentRightChannel(await astats(file))) {
					hit.push(id);
					console.log(`  left only: ${id}  ${row.label ?? ""}`);
				}
			} catch (e) {
				console.error(`  ${id}: ${e instanceof Error ? e.message : String(e)}`);
			} finally {
				await rm(file, { force: true });
			}
		}
		found += hit.length;
		if (hit.length === 0 || !apply) continue;
		for (const id of hit)
			await db.execute({
				sql: `update ${table} set playback_status = null where id = ? and playback_status = 'ready'`,
				args: [id],
			});
		const status = await postJobs(kind, hit);
		if (status === null) console.log(`  cleared ${hit.length} and posted ${kind} to ${origin}`);
		else {
			unposted.push(kind);
			console.log(
				`  cleared ${hit.length}; ${origin}/api/jobs answered ${status}, so open ${PAGE_OF[kind]} to start the render`,
			);
		}
	}
} finally {
	await rm(dir, { recursive: true, force: true });
}
console.log(
	found === 0
		? "No left-only rendition found."
		: apply
			? unposted.length === 0
				? `${found} rendition(s) re-rendering; the pages show them again as each finishes.`
				: `${found} rendition(s) cleared; the ones whose post failed render once their page is opened (${unposted.map((k) => PAGE_OF[k]).join("; ")}).`
			: `${found} left-only rendition(s); run with --apply to re-render them.`,
);
