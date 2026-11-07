/**
 * Draws Stem Shovel's Open Graph card (static/og.png, 1200×630): the
 * wordmark, the headline and tagline from src/lib/constants/socialCard.ts,
 * and a song's player drawn in CSS (four stem rows, the bass soloed), in the
 * site's look. Self-contained: the fonts come from static/fonts as base64,
 * the wordmark is inlined, nothing is fetched. Deterministic: the waveforms
 * come from a seeded generator. The PNG is committed; run `bun scripts/og.ts`
 * after changing the headline or the look.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { SOCIAL_CARD_HEADLINE, SOCIAL_CARD_TAGLINE } from "../src/lib/constants/socialCard";

const root = fileURLToPath(new URL("..", import.meta.url));
const fontUrl = (file: string) =>
	`data:font/woff2;base64,${readFileSync(join(root, "static/fonts", file)).toString("base64")}`;
const face = (family: string, weight: number, file: string) =>
	`@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;src:url(${fontUrl(file)}) format("woff2")}`;
const fonts = [
	face("Noto Sans", 400, "noto-sans-latin-400-normal.woff2"),
	face("Noto Sans", 600, "noto-sans-latin-600-normal.woff2"),
	face("Noto Sans", 700, "noto-sans-latin-700-normal.woff2"),
	face("Noto Serif", 400, "noto-serif-latin-400-normal.woff2"),
].join("\n");

// The wordmark without its fixed size: the .mark box sets the width.
const wordmark = readFileSync(join(root, "src/lib/assets/stem-shovel-wordmark.svg"), "utf8")
	.replace(/\s(width|height|style)="[^"]*"/g, "")
	.replace("<svg", '<svg width="300" height="54"');

const escapeHtml = (text: string) =>
	text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** A linear congruential generator: the same bars on every run. */
function lcg(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

const BARS = 90;
/** Each stem's shape: a bar's height (0–1) from its index and a random draw. */
const STEMS: { name: string; seed: number; shape: (i: number, r: number) => number }[] = [
	// Hits on the beat, decaying between.
	{ name: "Drums", seed: 7, shape: (i, r) => (i % 6 === 0 ? 0.85 + r * 0.15 : 0.15 + r * 0.45) },
	// Steady and full.
	{ name: "Bass", seed: 11, shape: (_, r) => 0.5 + r * 0.3 },
	// Swells.
	{ name: "Keys", seed: 23, shape: (i, r) => 0.3 + 0.3 * Math.sin(i / 6) ** 2 + r * 0.25 },
	// Phrases with breaths between.
	{ name: "Vocals", seed: 41, shape: (i, r) => (i % 28 > 22 ? 0.05 + r * 0.05 : 0.3 + r * 0.6) },
];

const bars = (seed: number, shape: (i: number, r: number) => number) => {
	const rand = lcg(seed);
	return Array.from({ length: BARS }, (_, i) => {
		const h = Math.min(1, shape(i, rand()));
		const opacity = 0.7 + rand() * 0.15;
		return `<i style="height:${(h * 100).toFixed(1)}%;opacity:${opacity.toFixed(2)}"></i>`;
	}).join("");
};

const rows = STEMS.map(
	({ name, seed, shape }, i) => `<div class="row${i === 1 ? " solo" : ""}">
	<div class="name">${name}</div>
	<div class="ms"><b>M</b><b class="s">S</b></div>
	<div class="wave">${bars(seed, shape)}</div>
</div>`,
).join("");

// The colors and fonts are the site's: uno.config.ts (oxford, accent, surface, font).
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;padding:36px 64px;display:flex;flex-direction:column;color:#f5f5f5;font-family:"Noto Sans",sans-serif;
	background:linear-gradient(to bottom right,oklch(0.25 0.09 265/0.2),oklch(0.115 0.048 259.91) 45%,oklch(0.25 0.09 265/0.4)),oklch(0.115 0.048 259.91)}
.mark{display:block;line-height:0}
.mark svg{fill:#ebfa2f}
h1{margin-top:20px;font:400 41px/1.2 "Noto Serif",serif;text-wrap:balance;max-width:1000px}
p{margin-top:8px;font-size:22px;line-height:1.3;opacity:.7}
.panel{margin-top:22px;flex:1;min-height:0;display:flex;flex-direction:column;gap:6px;padding:12px 18px 14px;
	border:2px solid rgb(191 219 254/0.1);border-radius:10px;background:rgba(255,255,255,.03)}
.top{display:flex;justify-content:space-between;align-items:baseline;font-size:20px;font-weight:600}
.readout{font:500 16px/1 ui-monospace,"DejaVu Sans Mono","Liberation Mono",monospace;opacity:.8;letter-spacing:.02em}
.rows{flex:1;display:flex;flex-direction:column;gap:6px}
.row{flex:1;display:grid;grid-template-columns:96px 70px 1fr;align-items:center;gap:12px;padding:0 12px;border-radius:6px;background:rgba(255,255,255,.05)}
.name{font-size:20px;font-weight:600}
.ms{display:flex;gap:6px}
.ms b{width:28px;height:24px;border-radius:4px;display:grid;place-items:center;font:700 13px/1 "Noto Sans",sans-serif;border:1px solid rgba(255,255,255,.25);color:rgba(255,255,255,.75)}
.solo .s{background:#ebf92f;border-color:#ebf92f;color:oklch(0.115 0.048 259.91)}
.wave{height:80%;display:flex;align-items:center;gap:4px}
.wave i{flex:1;background:#fff;border-radius:1px}
.solo .wave i{background:#ebf92f}
.row:not(.solo){opacity:.85}
</style></head><body>
<div class="mark">${wordmark}</div>
<h1>${escapeHtml(SOCIAL_CARD_HEADLINE)}</h1>
<p>${escapeHtml(SOCIAL_CARD_TAGLINE)}</p>
<section class="panel">
	<div class="top"><span>Peaceful Dreams</span><span class="readout">1 | 1 · F#maj · 132 bpm · 4/4</span></div>
	<div class="rows">${rows}</div>
</section>
</body></html>`;

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(root, "static/og.png") });
await browser.close();
console.log("static/og.png");
