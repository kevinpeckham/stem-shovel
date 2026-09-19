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
 * something in it. The /releases page feeds it the "releases" user doc.
 */
export function parseChangelog(markdown: string): Release[] {
	const out: Release[] = [];
	const parts = markdown.split(/^## \[/m).slice(1);
	for (const part of parts) {
		const nl = part.indexOf("\n");
		const heading = part.slice(0, nl);
		const m = heading.match(/^([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/);
		if (!m) continue;
		const version = m[1].trim();
		const date = m[2] ?? null;
		const body = part
			.slice(nl + 1)
			.split(/^### /m)
			.filter((chunk, i) => i === 0 || !/^Technical\b/.test(chunk))
			.map((chunk, i) => (i === 0 ? chunk : `### ${chunk}`))
			.join("")
			.trim();
		if (version === "Unreleased" && body === "") continue;
		out.push({ version, date, body });
	}
	return out;
}
