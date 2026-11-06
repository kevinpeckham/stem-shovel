/**
 * The nightly smoke test from GitHub's network (.github/workflows/smoke.yml):
 * runs smoke:urls and audit:seo against a deployed stage and reports to
 * Sentry, slx-web's pattern. A cron monitor check-in wraps the run, so a run
 * that fails and a run that never happens both become an issue, and each
 * failing URL or finding is an event with a stable fingerprint. `bun run
 * smoke:nightly` runs the same thing from the VM through varlock. Env:
 * SMOKE_BASE (default production), SMOKETEST_TOKEN (the firewall's bypass
 * header, scripts/lib/smoketestHeaders.mjs), SMOKE_SEGMENTS (the dynamic
 * routes' values as JSON where there is no database; `bun run
 * smoke:segments` prints them), SENTRY_DSN (optional; the app's DSN by
 * default, so the issues sit with the app's), NIGHTLY_DRY=1 to send nothing
 * to Sentry. Exits 1 on any failure.
 */
import * as Sentry from "@sentry/node";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SENTRY_DSN } from "../src/lib/constants/sentryDsn.ts";

const base = (process.env.SMOKE_BASE ?? "https://www.stemshovel.com").replace(/\/$/, "");
const MONITOR = "nightly-smoke";
/** Above this many failing URLs the site is down, and one event says so instead of a flood. */
const MASS_OUTAGE = 25;
/** The monitor's own schedule; keep it the workflow's cron. */
const monitorConfig = {
	schedule: { type: "crontab", value: "0 9 * * *" },
	checkinMargin: 15, // minutes; GitHub's cron is best-effort
	maxRuntime: 20,
	timezone: "Etc/UTC",
	failureIssueThreshold: 2, // two bad runs in a row before an issue
	recoveryThreshold: 1,
};

Sentry.init({
	dsn: process.env.NIGHTLY_DRY ? undefined : process.env.SENTRY_DSN || SENTRY_DSN,
	environment: "smoketest",
	tracesSampleRate: 0,
});

/** One script in the repo, its output through to the log; the exit code. */
function run(label, cmd, args, env) {
	console.log(`\n== ${label} (${base})`);
	const r = spawnSync(cmd, args, {
		stdio: ["ignore", "inherit", "inherit"],
		env: { ...process.env, ...env },
	});
	console.log(`== ${label}: exit ${r.status}`);
	return r.status ?? 1;
}
function readJson(file) {
	try {
		return JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return null;
	}
}
/** Each failing URL and each finding as its own Sentry event, or one event for an outage. */
function report(failures, findings) {
	if (failures.length > MASS_OUTAGE) {
		Sentry.captureMessage(`Smoke test: ${failures.length} URLs failing on ${base} (outage?)`, {
			level: "error",
			fingerprint: ["smoketest", "mass-outage"],
			extra: { base, sample: failures.slice(0, 25) },
		});
	} else {
		for (const f of failures) {
			const reason = `${f.status}${f.note ? ` ${f.note.trim()}` : ""}, wanted ${f.wanted?.join("/")}`;
			Sentry.captureException(new Error(`Smoke test failed: ${f.url} (${reason})`), {
				fingerprint: ["smoketest", new URL(f.url, base).pathname],
				extra: { base, ...f },
			});
		}
	}
	for (const f of findings) {
		Sentry.captureMessage(
			`SEO audit: ${f.route} ${f.check}: ${f.actual} (expected ${f.expected})`,
			{
				level: "warning",
				fingerprint: ["seo-audit", f.route, f.check],
				extra: { base, ...f },
			},
		);
	}
}

const dir = mkdtempSync(join(tmpdir(), "nightly-smoke-"));
let failed = false;
try {
	await Sentry.withMonitor(
		MONITOR,
		async () => {
			const smokeJson = join(dir, "smoke.json");
			const seoJson = join(dir, "seo.json");
			const smokeExit = run("smoke:urls", "node", ["scripts/smoke-urls.mjs", "--json", smokeJson], {
				SMOKE_BASE: base,
			});
			const seoExit = run("audit:seo", "bun", ["scripts/seo-audit.ts", "--json", seoJson], {
				SEO_BASE: base,
			});
			const smoke = readJson(smokeJson);
			const seo = readJson(seoJson);
			const failures = (smoke?.passes ?? []).flatMap((p) =>
				p.checks.filter((c) => !c.ok).map((c) => ({ pass: p.name, ...c })),
			);
			// Findings with an exception are known and accepted; the script's own exit code counts only the rest.
			const findings = (seo?.findings ?? []).filter((f) => !f.exception);
			report(failures, findings);
			if (!smoke) throw new Error(`smoke:urls exited ${smokeExit} without a result`);
			if (!seo) throw new Error(`audit:seo exited ${seoExit} without a result`);
			if (failures.length || findings.length)
				throw new Error(
					`${failures.length} failing URL(s), ${findings.length} finding(s) on ${base}`,
				);
			console.log(`\nnightly smoke: clean on ${base}`);
		},
		monitorConfig,
	);
} catch (e) {
	failed = true;
	console.error(`\nnightly smoke: ${e instanceof Error ? e.message : String(e)}`);
} finally {
	rmSync(dir, { recursive: true, force: true });
	await Sentry.flush(5000);
}
process.exit(failed ? 1 : 0);
