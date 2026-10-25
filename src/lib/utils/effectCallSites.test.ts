import { describe, expect, it } from "vite-plus/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { effectCallSites } from "./effectCallSites";

describe("effectCallSites", () => {
	it("finds each kind of call and reads the rationale on the line before", () => {
		const src = [
			"<script>",
			"\t// why $effect: draws the canvas",
			"\t$effect(() => draw());",
			"\t$effect.pre(() => {",
			"\t});",
			"\tconst stop = $effect.root(() => {});",
			"</script>",
		].join("\n");
		expect(effectCallSites(src)).toEqual([
			{ line: 3, callee: "$effect", rationale: "draws the canvas" },
			{ line: 4, callee: "$effect.pre", rationale: null },
		]);
	});
	it("ignores mentions in comments and prose", () => {
		expect(effectCallSites("// avoid $effect( here\n/* $effect( */\nlet s = '$effect(';")).toEqual(
			[],
		);
	});
	it("takes no rationale from another comment, or from one that is not directly above", () => {
		expect(
			effectCallSites("\t// keeps the playhead in view\n\t$effect(() => {});")[0]?.rationale,
		).toBeNull();
		expect(
			effectCallSites(
				"\t// why $effect: scrolls\n\t// Keep the playhead in view.\n\t$effect(() => {});",
			)[0]?.rationale,
		).toBeNull();
	});
});

/** A Svelte component or a `.svelte.ts` module, tests excepted. */
function isComponentFile(name: string): boolean {
	if (name.endsWith(".test.ts")) return false;
	return name.endsWith(".svelte") || name.endsWith(".svelte.ts");
}
/** Every .svelte and .svelte.ts file under src, tests excepted. */
function componentFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) componentFiles(path, out);
		else if (isComponentFile(entry.name)) out.push(path);
	}
	return out;
}

describe("the components' $effect calls", () => {
	it("each carry a rationale: a real side effect named, not derived state in an effect", () => {
		const unexplained: string[] = [];
		for (const file of componentFiles("src")) {
			for (const site of effectCallSites(readFileSync(file, "utf8"))) {
				if (!site.rationale) unexplained.push(`${file}:${site.line} ${site.callee}`);
			}
		}
		expect(
			unexplained,
			"an $effect without a `// why $effect: …` rationale on the line before it; reach for $derived, {@attach} or a handler first, and name the side effect if one remains (bun run audit:effects)",
		).toEqual([]);
	});
});
