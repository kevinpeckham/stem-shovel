/**
 * Swamp behavior type for the site's audits (docs/security.md "Indexability
 * audit", docs/testing.md "Smoke test"): each method runs one of the repo's
 * own scripts against a stage and records what it found as typed, versioned
 * data, so a workflow can assert on it and `swamp data query` can compare
 * runs. One definition per stage lives under models/ (site-dev, site-staging,
 * site-production); the site-audit workflow picks one by its `stage` input
 * and calls `audit`, which runs both scripts at once: two steps against one
 * definition would take turns on its lock.
 *
 * The scripts resolve their env through varlock (`bun run …`), so this file
 * carries no secrets and needs no vault. Swamp runs extensions on its own
 * Deno; `Deno` and `npm:` specifiers are right here and nowhere else in the
 * repo (tsconfig, oxlint and Fallow leave extensions/ alone).
 */
import { z } from "npm:zod@4";

const STAGES = ["dev", "staging", "production"] as const;

const GlobalArgsSchema = z.object({
	stage: z.enum(STAGES).describe("Which stage the base URL serves"),
	base: z.string().url().describe("The site's origin, e.g. https://www.stemshovel.com"),
});
type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

const FindingSchema = z.object({
	route: z.string(),
	path: z.string().optional(),
	check: z.string(),
	expected: z.string(),
	actual: z.string(),
	exception: z.string().optional(),
});

/** What `bun run audit:seo --json` writes. */
const SeoSchema = z.object({
	stage: z.enum(STAGES),
	base: z.string(),
	production: z
		.boolean()
		.describe("Whether the base is production (the X-Robots-Tag rule applies there only)"),
	checkedAt: z.string(),
	pages: z.number().int().describe("Routes and sitemap entries checked"),
	publicPages: z.number().int().describe("Pages meant to be indexed"),
	findings: z.number().int().describe("Real findings; the run is ok when this is 0"),
	exceptions: z.number().int().describe("Findings documented in SEO_EXPECTATIONS"),
	ok: z.boolean(),
	summary: z.string(),
	findingList: z.array(FindingSchema),
});

/** What `bun run smoke:urls --json` writes. */
const SmokeSchema = z.object({
	stage: z.enum(STAGES),
	base: z.string(),
	checkedAt: z.string(),
	checks: z.number().int().describe("URLs probed across the passes"),
	failures: z.number().int(),
	botPass: z
		.boolean()
		.describe("Whether the signed-in pass ran (the server recognized PREVIEW_AUTH_TOKEN)"),
	ok: z.boolean(),
	failed: z.array(
		z.object({
			pass: z.string(),
			url: z.string(),
			status: z.number().int(),
			wanted: z.array(z.number().int()),
			note: z.string().optional(),
		}),
	),
});

type Logger = {
	info(msg: string, ...args: unknown[]): void;
	warning(msg: string, ...args: unknown[]): void;
};
type Context = {
	signal: AbortSignal;
	repoDir: string;
	globalArgs: GlobalArgs;
	logger: Logger;
	writeResource: (
		specName: string,
		name: string,
		data: Record<string, unknown>,
	) => Promise<{ name: string }>;
	createFileWriter: (
		specName: string,
		name: string,
	) => { writeText: (text: string) => Promise<{ name: string }> };
};

/**
 * Runs one of the package scripts in the repo with an extra env and returns
 * its exit code and output. Throws when bun itself cannot start.
 */
async function runScript(
	context: Context,
	script: string,
	args: string[],
	env: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
	context.logger.info("Running bun run {script} against {base}", {
		script,
		base: context.globalArgs.base,
	});
	const out = await new Deno.Command("bun", {
		args: ["run", script, ...args],
		cwd: context.repoDir,
		env,
		stdout: "piped",
		stderr: "piped",
		signal: context.signal,
	}).output();
	const decoder = new TextDecoder();
	return { code: out.code, stdout: decoder.decode(out.stdout), stderr: decoder.decode(out.stderr) };
}

/** The scripts exit 2 when they cannot run at all (a route without a row, an unreachable base). */
function refuse(script: string, result: { code: number; stderr: string; stdout: string }): never {
	const tail = (result.stderr || result.stdout).trim().split("\n").slice(-6).join("\n");
	throw new Error(`bun run ${script} exited ${result.code} before it could audit:\n${tail}`);
}

/** The indexability audit: runs the script, records the outcome and keeps the report. */
async function auditSeo(context: Context): Promise<{ name: string }[]> {
	const { base, stage } = context.globalArgs;
	const dir = await Deno.makeTempDir({ prefix: "site-audit-" });
	try {
		const jsonPath = `${dir}/seo.json`;
		const reportPath = `${dir}/seo.md`;
		const result = await runScript(
			context,
			"audit:seo",
			["--json", jsonPath, "--report", reportPath],
			{
				SEO_BASE: base,
			},
		);
		if (result.code !== 0 && result.code !== 1) refuse("audit:seo", result);
		const raw = JSON.parse(await Deno.readTextFile(jsonPath)) as {
			production: boolean;
			pages: { intent: string }[];
			findings: z.infer<typeof FindingSchema>[];
		};
		const real = raw.findings.filter((f) => !f.exception);
		const summary = result.stdout.trim().split("\n").at(-1) ?? "";
		const data: z.infer<typeof SeoSchema> = {
			stage,
			base,
			production: raw.production,
			checkedAt: new Date().toISOString(),
			pages: raw.pages.length,
			publicPages: raw.pages.filter((p) => p.intent === "public").length,
			findings: real.length,
			exceptions: raw.findings.length - real.length,
			ok: real.length === 0,
			summary,
			findingList: raw.findings,
		};
		if (!data.ok) context.logger.warning("{findings} indexability finding(s) on {stage}", data);
		const handle = await context.writeResource("seo", "seo", data);
		const report = await context
			.createFileWriter("seoReport", "seo-report")
			.writeText(await Deno.readTextFile(reportPath));
		return [handle, report];
	} finally {
		await Deno.remove(dir, { recursive: true }).catch(() => {});
	}
}

/** The smoke test: runs the script and records the outcome. */
async function auditSmoke(context: Context): Promise<{ name: string }[]> {
	const { base, stage } = context.globalArgs;
	const dir = await Deno.makeTempDir({ prefix: "site-audit-" });
	try {
		const jsonPath = `${dir}/smoke.json`;
		const result = await runScript(context, "smoke:urls", ["--json", jsonPath], {
			SMOKE_BASE: base,
		});
		if (result.code !== 0 && result.code !== 1) refuse("smoke:urls", result);
		const raw = JSON.parse(await Deno.readTextFile(jsonPath)) as {
			botPass: boolean;
			failures: number;
			passes: {
				name: string;
				checks: { url: string; status: number; ok: boolean; wanted: number[]; note?: string }[];
			}[];
		};
		const data: z.infer<typeof SmokeSchema> = {
			stage,
			base,
			checkedAt: new Date().toISOString(),
			checks: raw.passes.reduce((n, p) => n + p.checks.length, 0),
			failures: raw.failures,
			botPass: raw.botPass,
			ok: raw.failures === 0,
			failed: raw.passes.flatMap((p) =>
				p.checks
					.filter((c) => !c.ok)
					.map((c) => ({
						pass: p.name,
						url: c.url,
						status: c.status,
						wanted: c.wanted,
						note: c.note,
					})),
			),
		};
		if (!data.ok) context.logger.warning("{failures} smoke failure(s) on {stage}", data);
		return [await context.writeResource("smoke", "smoke", data)];
	} finally {
		await Deno.remove(dir, { recursive: true }).catch(() => {});
	}
}

export const behavior = {
	type: "@kevin/site-audit",
	version: "2026.10.25.1",
	description:
		"Stem Shovel's own site audits (indexability, smoke) run against one stage and kept as data",
	globalArguments: GlobalArgsSchema,
	resources: {
		seo: {
			description: "The indexability audit's outcome: counts, ok and every finding",
			schema: SeoSchema,
			lifetime: "infinite",
			garbageCollection: 30,
		},
		smoke: {
			description: "The smoke test's outcome: counts, ok and every failed URL",
			schema: SmokeSchema,
			lifetime: "infinite",
			garbageCollection: 30,
		},
	},
	files: {
		seoReport: {
			description: "The indexability audit's Markdown report (the page table and findings)",
			contentType: "text/markdown",
			lifetime: "infinite",
			garbageCollection: 30,
		},
	},
	methods: {
		audit: {
			description:
				"Run both audits against the stage at once and record both results (one lock, one step)",
			arguments: z.object({}),
			execute: async (_args: Record<string, never>, context: Context) => {
				const [seo, smoke] = await Promise.all([auditSeo(context), auditSmoke(context)]);
				return { dataHandles: [...seo, ...smoke] };
			},
		},
		seo: {
			description: "Run bun run audit:seo against the stage and record the result",
			arguments: z.object({}),
			execute: async (_args: Record<string, never>, context: Context) => ({
				dataHandles: await auditSeo(context),
			}),
		},
		smoke: {
			description: "Run bun run smoke:urls against the stage and record the result",
			arguments: z.object({}),
			execute: async (_args: Record<string, never>, context: Context) => ({
				dataHandles: await auditSmoke(context),
			}),
		},
	},
};
