/**
 * Screenshot a page of the running dev server so the agent (or you) can look
 * at it: `bun run shot /projects [out.png] [width] [height]`. Full page unless
 * `SHOT_VIEWPORT=1`. Same idea as replicator's agent-screenshot setup, minus
 * the auth bypass: there is no sign-in here yet.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const base = process.env.SHOT_BASE ?? "http://localhost:5173";
const [
	path = "/",
	out = `.screenshots${path === "/" ? "/home" : path.replaceAll("/", "-").replace(/^-/, "/")}.png`,
	w = "1280",
	h = "800",
] = process.argv.slice(2);
const file = resolve(out);
mkdirSync(dirname(file), { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
	if (m.type() === "error") errors.push(`console: ${m.text()}`);
});
await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
await page.waitForTimeout(500); // fonts + hydration
await page.screenshot({ path: file, fullPage: process.env.SHOT_VIEWPORT !== "1" });
await browser.close();
console.log(`wrote ${file}${errors.length ? `\n${errors.join("\n")}` : ""}`);
