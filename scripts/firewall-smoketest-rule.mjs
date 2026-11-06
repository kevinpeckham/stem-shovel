/**
 * Create or update the firewall rule that lets the audit and screenshot
 * scripts past the site's bot protection: `bun run firewall:smoketest`. The
 * rule "Smoke-test token bypass" matches the `x-smoketest-token` header equal
 * to `SMOKETEST_TOKEN` (the dev 1Password environment, through varlock) and
 * bypasses the managed rulesets, whatever address the request comes from
 * (docs/security.md "Bot protection and the smoke-test token"). Run it once
 * to create the rule and again after rotating the token. It reads and writes
 * through the Vercel CLI's API passthrough (`vercel api`, signed in, the
 * project from `.vercel/project.json`), and the change is live at once: the
 * firewall's config API edits the active configuration, with no publish
 * step. The token itself is never printed; `--check` reports whether the rule
 * exists, is active and matches the header, and whether its value is the
 * environment's, without writing anything.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SMOKETEST_HEADER } from "./lib/smoketestHeaders.mjs";

const RULE_NAME = "Smoke-test token bypass";
const check = process.argv.includes("--check");
const token = process.env.SMOKETEST_TOKEN ?? "";

const link = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
const query = `projectId=${link.projectId}&teamId=${link.orgId}`;

/** One call through `vercel api`; the body, when given, travels in a private temp file. */
function api(path, method, body) {
	const dir = body ? mkdtempSync(join(tmpdir(), "firewall-smoketest-")) : null;
	const input = dir ? join(dir, "body.json") : null;
	try {
		if (input) writeFileSync(input, JSON.stringify(body), { mode: 0o600 });
		const out = execFileSync(
			"vercel",
			["api", `${path}?${query}`, "--method", method, ...(input ? ["--input", input] : [])],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
		);
		return out.trim() ? JSON.parse(out) : {};
	} finally {
		if (dir) rmSync(dir, { recursive: true, force: true });
	}
}

/** The rule's one condition, when it is the header match this script writes. */
function headerCondition(rule) {
	const conds = rule?.conditionGroup?.flatMap((g) => g.conditions) ?? [];
	const c = conds[0];
	return conds.length === 1 && c.type === "header" && c.op === "eq" && c.key === SMOKETEST_HEADER
		? c
		: null;
}

const config = api("/v1/security/firewall/config/active", "GET");
const rule = config.rules.find((r) => r.name === RULE_NAME);
if (check) {
	const cond = headerCondition(rule);
	console.log(
		rule
			? `"${RULE_NAME}" exists (config v${config.version}): active ${rule.active}, header match ${!!cond}, value is SMOKETEST_TOKEN's ${!!cond && !!token && cond.value === token}`
			: `no rule "${RULE_NAME}" in config v${config.version}`,
	);
	process.exit(
		rule && headerCondition(rule) && rule.active && token && cond.value === token ? 0 : 1,
	);
}
if (token.length < 32) {
	console.error(
		"SMOKETEST_TOKEN is unset or shorter than 32 characters; add it to the dev 1Password environment first",
	);
	process.exit(2);
}
const value = {
	name: RULE_NAME,
	description: `Requests carrying ${SMOKETEST_HEADER} skip bot protection: the VM's audits and screenshots, from any address (scripts/firewall-smoketest-rule.mjs; docs/security.md).`,
	active: true,
	conditionGroup: [
		{ conditions: [{ type: "header", key: SMOKETEST_HEADER, op: "eq", value: token }] },
	],
	action: { mitigate: { action: "bypass", actionDuration: null, rateLimit: null, redirect: null } },
};
api(
	"/v1/security/firewall/config",
	"PATCH",
	rule ? { action: "rules.update", id: rule.id, value } : { action: "rules.insert", value },
);
const after = api("/v1/security/firewall/config/active", "GET");
const now = after.rules.find((r) => r.name === RULE_NAME);
const ok = !!now?.active && headerCondition(now)?.value === token;
console.log(
	`${rule ? "updated" : "created"} "${RULE_NAME}" (config v${config.version} -> v${after.version}); matches SMOKETEST_TOKEN: ${ok}`,
);
process.exit(ok ? 0 : 1);
