/**
 * The $effect audit (docs/testing.md "The $effect audit"): every `$effect`,
 * `$effect.pre` and `$effect.root` call in the components, with the reason
 * its `// why $effect:` comment gives, so the list can be read as a whole and
 * re-read after a change. Svelte's effect is an escape hatch that gets used
 * for derived state (an extra update pass, no laziness, ordering races), so
 * the house rule makes each one say which real side effect it is.
 *
 *   bun run audit:effects                 # the table and the summary
 *   bun run audit:effects --json out.json # also as JSON
 *
 * Exits 1 when any call has no rationale (the Vitest test beside the util
 * fails on the same). Pure: no server, no database, no env.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
	EFFECT_RATIONALE_PREFIX,
	effectCallSites,
	type EffectCallSite,
} from "../src/lib/utils/effectCallSites";

function argPath(flag: string): string | undefined {
	const i = process.argv.indexOf(flag);
	return i > 0 ? process.argv[i + 1] : undefined;
}
/** A Svelte component or a `.svelte.ts` module, tests excepted. */
function isComponentFile(name: string): boolean {
	if (name.endsWith(".test.ts")) return false;
	return name.endsWith(".svelte") || name.endsWith(".svelte.ts");
}
function componentFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) componentFiles(path, out);
		else if (isComponentFile(entry.name)) out.push(path);
	}
	return out;
}

const sites: (EffectCallSite & { file: string })[] = [];
for (const file of componentFiles("src").sort()) {
	for (const site of effectCallSites(readFileSync(file, "utf8")))
		sites.push({ file: relative(process.cwd(), file), ...site });
}
const files = new Set(sites.map((s) => s.file));
const unexplained = sites.filter((s) => !s.rationale);

const width = Math.max(...sites.map((s) => `${s.file}:${s.line}`.length), 10);
for (const s of sites) {
	const where = `${s.file}:${s.line}`.padEnd(width);
	console.log(
		`${s.rationale ? "   " : "!! "}${where}  ${s.callee.padEnd(12)}  ${s.rationale ?? "(no rationale)"}`,
	);
}
const summary = `${sites.length} $effect call(s) in ${files.size} file(s), ${unexplained.length} without a rationale`;
console.log(`\n${summary}`);
if (unexplained.length)
	console.log(
		`Each call needs \`${EFFECT_RATIONALE_PREFIX} <which side effect>\` alone on the line before it, or a $derived, an attachment or a handler instead (docs/testing.md "The $effect audit").`,
	);

const json = argPath("--json");
if (json)
	writeFileSync(
		json,
		JSON.stringify(
			{ total: sites.length, files: files.size, unexplained: unexplained.length, summary, sites },
			null,
			"\t",
		),
	);
process.exit(unexplained.length ? 1 : 0);
