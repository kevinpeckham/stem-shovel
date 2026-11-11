/**
 * Copies the engraver the Score view loads (`@barmark/engraver`, barmark's
 * 3 MB build of Verovio) from node_modules into static/engraver/<version>/,
 * where the app serves it from its own origin (`renderScoreChartHtml` points
 * `verovio-url` there). The copy is committed; rerun after an engraver bump,
 * and the test in src/lib/server/chartHtml.test.ts checks the files against
 * the digests `@barmark/score` publishes for the version it expects.
 *
 * Usage: bun run engraver
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const dist = "node_modules/@barmark/engraver/dist";
const { version } = JSON.parse(readFileSync("node_modules/@barmark/engraver/package.json", "utf8"));
const root = "static/engraver";
const dir = join(root, version);

for (const old of readdirSync(root, { withFileTypes: true }).filter(
	(d) => d.isDirectory() && d.name !== version,
)) {
	rmSync(join(root, old.name), { recursive: true });
	console.log(`removed ${join(root, old.name)}`);
}
mkdirSync(dir, { recursive: true });
for (const file of ["verovio-module.mjs", "verovio-module.wasm"]) {
	copyFileSync(join(dist, file), join(dir, file));
	const digest = createHash("sha384")
		.update(readFileSync(join(dir, file)))
		.digest("base64");
	console.log(`${join(dir, file)}  sha384-${digest}`);
}
