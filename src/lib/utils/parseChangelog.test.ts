import { describe, expect, test } from "vite-plus/test";
import { parseChangelog } from "./parseChangelog";

const sample = `# Changelog

Notes about the format.

## [Unreleased]

## [0.19.0] - 2026-09-19

### Added

- **Lossless takes.** Text.

### Technical

- Migration 0042.

### Fixed

- **A fix.** Text.

## [0.18.0] - 2026-09-19

### Added

- **A user drill-down in the admin.**
`;

describe("parseChangelog", () => {
	test("one release per version, newest first, with its date", () => {
		const r = parseChangelog(sample);
		expect(r.map((x) => x.version)).toEqual(["0.19.0", "0.18.0"]);
		expect(r[0].date).toBe("2026-09-19");
	});
	test("leaves the Technical subsection out and keeps the others", () => {
		const [first] = parseChangelog(sample);
		expect(first.body).toContain("### Added");
		expect(first.body).toContain("### Fixed");
		expect(first.body).not.toContain("Technical");
		expect(first.body).not.toContain("Migration 0042");
	});
	test("an empty Unreleased section is skipped, a filled one is kept", () => {
		expect(parseChangelog(sample)[0].version).not.toBe("Unreleased");
		const withNotes = sample.replace(
			"## [Unreleased]\n",
			"## [Unreleased]\n\n### Added\n\n- Soon.\n",
		);
		const [next] = parseChangelog(withNotes);
		expect(next.version).toBe("Unreleased");
		expect(next.date).toBeNull();
		expect(next.body).toContain("Soon.");
	});

	test("headings the in-app editor saved with escaped brackets", () => {
		const escaped = String.raw`## \[Unreleased\]

## \[0.31.0\] - 2026-09-22

### Changed

- **The tuner has a new look.**
`;
		const out = parseChangelog(escaped);
		expect(out.map((r) => [r.version, r.date])).toEqual([["0.31.0", "2026-09-22"]]);
		expect(out[0].body).toContain("The tuner has a new look.");
	});
	test("headings written by hand without brackets, with a hyphen or an em dash, and a plain ## heading inside a section", () => {
		const md = `## 0.51.0 — 2026-09-28\n\n### Added\n- Text-to-Beat.\n\n## 0.50.0 - 2026-09-28\n\n### Added\n- A reset.\n\n## \\[0.49.0\\] - 2026-09-28\n\n### Added\n- Delay and reverb.\n\n## A note\n\nStill 0.49.0's.\n`;
		const r = parseChangelog(md);
		expect(r.map((x) => [x.version, x.date])).toEqual([
			["0.51.0", "2026-09-28"],
			["0.50.0", "2026-09-28"],
			["0.49.0", "2026-09-28"],
		]);
		expect(r[0]!.body).toBe("### Added\n- Text-to-Beat.");
		expect(r[2]!.body).toContain("Still 0.49.0's.");
	});
});
