/**
 * Swamp behavior type for the repo-level audits (the code, not a running
 * site; site_audit.ts covers those): each method runs one of the repo's
 * own scripts and records what it found as typed, versioned data. One
 * definition, `repo`, lives under models/; the code-audit workflow calls it
 * and asserts the results are clean. Pure scripts: no server, no env, so
 * no vault.
 */
import { z } from "npm:zod@4";

const GlobalArgsSchema = z.object({
	label: z.string().default("repo").describe("A name for the checkout being audited"),
});
type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

/** What `bun run audit:effects --json` writes (docs/testing.md "The $effect audit"). */
const EffectsSchema = z.object({
	label: z.string(),
	checkedAt: z.string(),
	total: z.number().int().describe("$effect, $effect.pre and $effect.root calls in the components"),
	files: z.number().int(),
	unexplained: z
		.number()
		.int()
		.describe("Calls with no rationale on the line before; the run is ok when this is 0"),
	ok: z.boolean(),
	summary: z.string(),
	sites: z.array(
		z.object({
			file: z.string(),
			line: z.number().int(),
			callee: z.string(),
			rationale: z.string().nullable(),
		}),
	),
});

type Context = {
	signal: AbortSignal;
	repoDir: string;
	globalArgs: GlobalArgs;
	logger: {
		info(msg: string, ...args: unknown[]): void;
		warning(msg: string, ...args: unknown[]): void;
	};
	writeResource: (
		specName: string,
		name: string,
		data: Record<string, unknown>,
	) => Promise<{ name: string }>;
};

async function runScript(context: Context, script: string, args: string[]) {
	context.logger.info("Running bun run {script}", { script });
	const out = await new Deno.Command("bun", {
		args: ["run", script, ...args],
		cwd: context.repoDir,
		stdout: "piped",
		stderr: "piped",
		signal: context.signal,
	}).output();
	const decoder = new TextDecoder();
	return { code: out.code, stdout: decoder.decode(out.stdout), stderr: decoder.decode(out.stderr) };
}

export const behavior = {
	type: "@kevin/repo-audit",
	version: "2026.10.25.1",
	description:
		"Stem Shovel's repo-level audits (the $effect audit) run on the checkout and kept as data",
	globalArguments: GlobalArgsSchema,
	resources: {
		effects: {
			description: "The $effect audit's outcome: counts, ok and every call site with its rationale",
			schema: EffectsSchema,
			lifetime: "infinite",
			garbageCollection: 30,
		},
	},
	methods: {
		effects: {
			description:
				"Run bun run audit:effects and record every $effect call site with its rationale",
			arguments: z.object({}),
			execute: async (_args: Record<string, never>, context: Context) => {
				const dir = await Deno.makeTempDir({ prefix: "repo-audit-" });
				try {
					const jsonPath = `${dir}/effects.json`;
					const result = await runScript(context, "audit:effects", ["--json", jsonPath]);
					if (result.code !== 0 && result.code !== 1) {
						const tail = (result.stderr || result.stdout).trim().split("\n").slice(-6).join("\n");
						throw new Error(
							`bun run audit:effects exited ${result.code} before it could audit:\n${tail}`,
						);
					}
					const raw = JSON.parse(await Deno.readTextFile(jsonPath)) as Omit<
						z.infer<typeof EffectsSchema>,
						"label" | "checkedAt" | "ok"
					>;
					const data: z.infer<typeof EffectsSchema> = {
						label: context.globalArgs.label,
						checkedAt: new Date().toISOString(),
						...raw,
						ok: raw.unexplained === 0,
					};
					if (!data.ok)
						context.logger.warning("{unexplained} $effect call(s) without a rationale", data);
					return { dataHandles: [await context.writeResource("effects", "effects", data)] };
				} finally {
					await Deno.remove(dir, { recursive: true }).catch(() => {});
				}
			},
		},
	},
};
