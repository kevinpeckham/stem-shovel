/**
 * Screenshot a page of a deployed stage through Browserless, the way
 * replicator captures production: `bun run shot:remote /pricing [out.png]
 * [width] [height]`. The page renders in Browserless's own browsers, so this
 * is the view from outside the VM; `bun run shot` with `SHOT_BASE` is the
 * everyday way to look at a live page. Same knobs as scripts/screenshot.mjs:
 * full page unless `SHOT_VIEWPORT=1`, `SHOT_WAIT` extra settle time,
 * `SHOT_BASE` the stage (default production), `SHOT_ANON=1` the signed-out
 * view. With `PREVIEW_AUTH_TOKEN` set the page carries it as the
 * `preview_token` cookie for the stage's host only, which signs in the
 * Screenshot Bot where the stage knows the token (dev and staging; production
 * never does). With `SMOKETEST_TOKEN` set every request of the page carries
 * the firewall's bypass header (Browserless sets extra headers per page, not
 * per host; the token only skips the bot check, it signs nothing in).
 * `BROWSERLESS_TOKEN` comes from the dev 1Password environment through
 * varlock (`.env.schema`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { SMOKETEST_HEADER } from "./lib/smoketestHeaders.mjs";

const base = process.env.SHOT_BASE ?? "https://www.stemshovel.com";
const [
	path = "/",
	out = `.screenshots${path === "/" ? "/home" : path.replaceAll("/", "-").replace(/^-/, "/")}-remote.png`,
	w = "1280",
	h = "800",
] = process.argv.slice(2);
const token = process.env.BROWSERLESS_TOKEN;
if (!token) {
	console.error(
		"BROWSERLESS_TOKEN is not set (the dev 1Password environment supplies it through varlock)",
	);
	process.exit(2);
}
const file = resolve(out);
mkdirSync(dirname(file), { recursive: true });

const url = `${base}${path}`;
const host = new URL(base).hostname;
const preview = process.env.SHOT_ANON === "1" ? "" : (process.env.PREVIEW_AUTH_TOKEN ?? "");
const smoke = process.env.SMOKETEST_TOKEN ?? "";
const payload = {
	url,
	viewport: { width: Number(w), height: Number(h) },
	options: { type: "png", fullPage: process.env.SHOT_VIEWPORT !== "1" },
	gotoOptions: { waitUntil: "networkidle2", timeout: 45000 },
	waitForTimeout: Number(process.env.SHOT_WAIT ?? 500),
	...(smoke ? { setExtraHTTPHeaders: { [SMOKETEST_HEADER]: smoke } } : {}),
	...(preview
		? {
				cookies: [
					{
						name: "preview_token",
						value: preview,
						domain: host,
						path: "/",
						httpOnly: true,
						secure: base.startsWith("https:"),
						sameSite: "Lax",
					},
				],
			}
		: {}),
};
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 90000);
try {
	const res = await fetch(`https://production-sfo.browserless.io/screenshot?token=${token}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
		body: JSON.stringify(payload),
		signal: controller.signal,
	});
	if (!res.ok) {
		console.error(`Browserless answered ${res.status}: ${(await res.text()).slice(0, 400)}`);
		process.exit(1);
	}
	writeFileSync(file, Buffer.from(await res.arrayBuffer()));
	console.log(`wrote ${file} (${url})`);
} catch (e) {
	console.error(
		e instanceof Error && e.name === "AbortError" ? "Browserless timed out after 90 s" : String(e),
	);
	process.exit(1);
} finally {
	clearTimeout(timer);
}
