/**
 * Swamp behavior type for the Sentry triage pipeline (docs/security.md
 * "Sentry triage"): `scan` lists production's unresolved issues of the last
 * N hours as typed data, and `triage` has a headless Claude Code diagnose
 * the newest ones in a worktree, opening a pull request against dev when the
 * cause is clear and the fix is small (scripts/sentry-diagnose.ts holds the
 * rules, the gates and the ledger under .sentry-triage/). Each diagnosis is a
 * `triage` resource with its report as a file, so `swamp data query` and the
 * reports show what the night found; the sentry-triage workflow runs both on
 * the serve daemon's schedule.
 *
 * The scripts resolve their env through varlock (`bun run …`), so this file
 * carries no secrets and needs no vault. Swamp runs extensions on its own
 * Deno; `Deno` and `npm:` specifiers are right here and nowhere else in the
 * repo (tsconfig, oxlint and Fallow leave extensions/ alone).
 */
import { z } from "npm:zod@4";

const GlobalArgsSchema = z.object({
	environment: z.string().default("production").describe("The Sentry environment to triage"),
	hours: z.number().int().positive().default(24).describe("How far back a scan looks"),
	maxIssues: z
		.number()
		.int()
		.positive()
		.default(3)
		.describe("How many issues one triage run diagnoses"),
	model: z.string().default("claude-opus-5-5").describe("The model the diagnosis runs on"),
	agentMode: z
		.enum(["diagnose", "fix"])
		.default("diagnose")
		.describe(
			"diagnose: the agent reads only and proposes a patch (what unattended runs do); fix: it edits, the gates run and a pull request opens (attended only; FINDINGS.md, sentry:diagnose and untrusted error text)",
		),
	ledger: z
		.string()
		.default(".sentry-triage")
		.describe(
			"Where the records live, relative to the repo (gitignored); an issue with a record is not diagnosed again",
		),
});
type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

const IssueSchema = z.object({
	id: z.string(),
	shortId: z.string(),
	title: z.string(),
	culprit: z.string().nullable().optional(),
	level: z.string(),
	count: z.coerce.number(),
	userCount: z.coerce.number(),
	firstSeen: z.string(),
	lastSeen: z.string(),
	permalink: z.string(),
});

/** What `bun run sentry:scan --json` writes, minus each issue's event detail. */
const ScanSchema = z.object({
	scannedAt: z.string(),
	environment: z.string(),
	hours: z.number().int(),
	count: z.number().int().describe("Unresolved issues seen in the window"),
	issues: z.array(IssueSchema),
});

/** One record `sentry:diagnose` wrote: a diagnosis and what came of it. */
const TriageSchema = z.object({
	shortId: z.string(),
	id: z.string(),
	title: z.string(),
	permalink: z.string(),
	diagnosedAt: z.string(),
	model: z.string(),
	confidence: z.enum(["high", "medium", "low"]),
	fix: z
		.enum(["applied", "proposed", "none"])
		.describe(
			"applied: a pull request against dev; proposed: a diagnosis with a recommended fix; none: no fix to recommend",
		),
	downgradedBecause: z.string().optional(),
	recommendation: z.string(),
	risk: z.string(),
	summary: z.string(),
	files: z.array(z.string()),
	branch: z.string().optional(),
	pr: z.string().optional().describe("The pull request's URL when a fix was applied"),
	patch: z
		.string()
		.optional()
		.describe("The diff the agent proposed or applied, as a file beside the record"),
	diagnosis: z.string().optional(),
	gates: z
		.object({ lint: z.boolean(), check: z.boolean(), test: z.boolean() })
		.partial()
		.optional(),
	costUsd: z.number().optional(),
	durationMs: z.number().optional(),
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

/** Runs one of the package scripts in the repo and returns its exit code and output. */
async function runScript(
	context: Context,
	script: string,
	args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
	context.logger.info("Running bun run {script} {args}", { script, args: args.join(" ") });
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

function refuse(script: string, result: { code: number; stderr: string; stdout: string }): never {
	const tail = (result.stderr || result.stdout).trim().split("\n").slice(-6).join("\n");
	throw new Error(`bun run ${script} exited ${result.code}:\n${tail}`);
}

/** The scan script into a temp file; the parsed result and the file's path (the caller removes the dir). */
async function scanTo(
	context: Context,
	dir: string,
): Promise<{ path: string; data: z.infer<typeof ScanSchema> }> {
	const { environment, hours } = context.globalArgs;
	const path = `${dir}/scan.json`;
	const result = await runScript(context, "sentry:scan", [
		"--hours",
		String(hours),
		"--environment",
		environment,
		"--json",
		path,
	]);
	if (result.code !== 0) refuse("sentry:scan", result);
	const raw = JSON.parse(await Deno.readTextFile(path)) as z.infer<typeof ScanSchema>;
	const data = ScanSchema.parse({
		scannedAt: raw.scannedAt,
		environment: raw.environment,
		hours: raw.hours,
		count: raw.count,
		issues: raw.issues.map((i) => IssueSchema.parse(i)),
	});
	return { path, data };
}

async function scan(context: Context): Promise<{ name: string }[]> {
	const dir = await Deno.makeTempDir({ prefix: "sentry-triage-" });
	try {
		const { data } = await scanTo(context, dir);
		context.logger.info("{count} unresolved issue(s) on {environment} in the last {hours} h", data);
		return [await context.writeResource("scan", "scan", data)];
	} finally {
		await Deno.remove(dir, { recursive: true }).catch(() => {});
	}
}

/** Scan, then diagnose the newest issues without a record; each record written since the start becomes a resource. */
async function triage(context: Context): Promise<{ name: string }[]> {
	const { maxIssues, model, ledger, agentMode } = context.globalArgs;
	const dir = await Deno.makeTempDir({ prefix: "sentry-triage-" });
	const started = Date.now();
	try {
		const { path, data } = await scanTo(context, dir);
		const handles = [await context.writeResource("scan", "scan", data)];
		if (data.count === 0) {
			context.logger.info("Nothing to triage");
			return handles;
		}
		const result = await runScript(context, "sentry:diagnose", [
			"--scan",
			path,
			"--max",
			String(maxIssues),
			"--out",
			ledger,
			"--model",
			model,
			"--mode",
			agentMode,
		]);
		if (result.code === 3)
			throw new Error("claude is not signed in on this machine; nothing was diagnosed");
		if (result.code === 2) refuse("sentry:diagnose", result);
		const ledgerDir = `${context.repoDir}/${ledger}`;
		for await (const entry of Deno.readDir(ledgerDir)) {
			if (!entry.isFile || !entry.name.endsWith(".json")) continue;
			const file = `${ledgerDir}/${entry.name}`;
			const stat = await Deno.stat(file);
			if ((stat.mtime?.getTime() ?? 0) < started) continue;
			const record = TriageSchema.parse(JSON.parse(await Deno.readTextFile(file)));
			context.logger.info("{shortId}: {fix} ({confidence}){pr}", {
				...record,
				pr: record.pr ? ` ${record.pr}` : "",
			});
			handles.push(await context.writeResource("triage", `triage-${record.shortId}`, record));
			const md = file.replace(/\.json$/, ".md");
			try {
				handles.push(
					await context
						.createFileWriter("triageReport", `triage-${record.shortId}`)
						.writeText(await Deno.readTextFile(md)),
				);
			} catch {
				context.logger.warning("No report file for {shortId}", record);
			}
		}
		if (result.code !== 0) context.logger.warning("sentry:diagnose exited {code}", result);
		return handles;
	} finally {
		await Deno.remove(dir, { recursive: true }).catch(() => {});
	}
}

export const behavior = {
	type: "@kevin/sentry-triage",
	version: "2026.11.06.2",
	description:
		"Sentry triage: production's unresolved issues as data, and a headless Claude Code diagnosing the newest ones, with a pull request against dev when the fix is small",
	globalArguments: GlobalArgsSchema,
	resources: {
		scan: {
			description: "The unresolved issues of the environment in the window, newest first",
			schema: ScanSchema,
			lifetime: "infinite",
			garbageCollection: 60,
		},
		triage: {
			description:
				"One issue's diagnosis: confidence, whether a fix was applied (a PR) or proposed, and the gates",
			schema: TriageSchema,
			lifetime: "infinite",
			garbageCollection: 200,
		},
	},
	files: {
		triageReport: {
			description: "The diagnosis as Markdown, as scripts/sentry-diagnose.ts wrote it",
			contentType: "text/markdown",
			lifetime: "infinite",
			garbageCollection: 200,
		},
	},
	methods: {
		scan: {
			description:
				"List the environment's unresolved issues of the last `hours` hours (reads Sentry only)",
			arguments: z.object({}),
			execute: async (_args: Record<string, never>, context: Context) => ({
				dataHandles: await scan(context),
			}),
		},
		triage: {
			description:
				"Scan, then diagnose up to `maxIssues` issues without a record: a diagnosis each, and a pull request against dev for a small, clear fix",
			arguments: z.object({}),
			execute: async (_args: Record<string, never>, context: Context) => ({
				dataHandles: await triage(context),
			}),
		},
	},
};
