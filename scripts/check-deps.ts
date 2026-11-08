/**
 * Run before `bun run dev` (package.json `predev`): exits 1, naming each package, when
 * node_modules holds a version other than the one package.json pins exactly. A pull that
 * bumps a pin without `bun install` otherwise serves the old package, and the dev server
 * fails on the first import only the new one has (STEM-SHOVEL-7K: `readMxl` from
 * @barmark/musicxml 0.4.0). Run `bun install`; SKIP_DEPS_CHECK=1 skips the check.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pinnedDependencyDrift } from "../src/lib/utils/pinnedDependencyDrift";

if (!process.env.SKIP_DEPS_CHECK) {
	const root = fileURLToPath(new URL("..", import.meta.url));
	const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	const installedVersionOf = (name: string): string | null => {
		try {
			const manifest = readFileSync(join(root, "node_modules", name, "package.json"), "utf8");
			return (JSON.parse(manifest) as { version?: string }).version ?? null;
		} catch {
			return null;
		}
	};
	const drift = pinnedDependencyDrift(
		{ ...pkg.devDependencies, ...pkg.dependencies },
		installedVersionOf,
	);
	if (drift.length > 0) {
		console.error("node_modules does not match package.json's pins:");
		for (const { name, pinned, installed } of drift)
			console.error(`  ${name}: pinned ${pinned}, installed ${installed ?? "nothing"}`);
		console.error("Run `bun install` (and restart the dev server).");
		process.exit(1);
	}
}
