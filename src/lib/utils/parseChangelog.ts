export interface Release {
	/** "0.19.0", or "Unreleased". */
	version: string;
	/** "2026-09-19", or null for the unreleased section. */
	date: string | null;
	/** The section's markdown without its version heading and without the "### Technical" part. */
	body: string;
}

/**
 * A Keep-a-Changelog file (`## [x.y.z] - YYYY-MM-DD` sections with
 * `### Added` / `### Changed` / `### Fixed` / `### Technical`) as the
 * releases page shows it: every version, newest first, any Technical
 * subsection left out, and the Unreleased section only when it has
 * something in it. The /releases page feeds it the "releases" user doc,
 * which the in-app editor saves with the brackets escaped (`## \[0.31.0\]`),
 * and which has also been written by hand as `## 0.51.0 — 2026-09-28`
 * (no brackets, an em dash), so every one of those spellings counts; a
 * `## ` heading that is not a version is part of the section above it.
 */
export function parseChangelog(markdown: string): Release[] {
	const out: Release[] = [];
	const heading =
		/^## +\\?\[?(Unreleased|\d+\.\d+\.\d+)\\?\]?(?:\s*[-–—]\s*(\d{4}-\d{2}-\d{2}))?\s*$/;
	let current: Release | null = null;
	let lines: string[] = [];
	const close = () => {
		if (!current) return;
		const body = lines
			.join("\n")
			.split(/^### /m)
			.filter((chunk, i) => i === 0 || !/^Technical\b/.test(chunk))
			.map((chunk, i) => (i === 0 ? chunk : `### ${chunk}`))
			.join("")
			.trim();
		if (!(current.version === "Unreleased" && body === "")) out.push({ ...current, body });
	};
	for (const line of markdown.split("\n")) {
		const m = line.match(heading);
		if (m) {
			close();
			current = { version: m[1]!, date: m[2] ?? null, body: "" };
			lines = [];
		} else if (current) {
			lines.push(line);
		}
	}
	close();
	return out;
}
