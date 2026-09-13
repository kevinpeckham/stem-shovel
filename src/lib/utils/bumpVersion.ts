/** "1.2.3" bumped at one level; the levels below reset. Unparseable input becomes "0.0.1". */
export function bumpVersion(version: string, level: "major" | "minor" | "patch"): string {
	const m = version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
	if (!m) return "0.0.1";
	const [major, minor, patch] = m.slice(1).map(Number);
	if (level === "major") return `${major + 1}.0.0`;
	if (level === "minor") return `${major}.${minor + 1}.0`;
	return `${major}.${minor}.${patch + 1}`;
}
