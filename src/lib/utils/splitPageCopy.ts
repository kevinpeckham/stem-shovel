/**
 * A page's copy doc (docs/page-copy.md) into its parts: the title is the
 * first `# ` heading, the intro the first paragraph after it (the lines
 * up to a blank one, joined), and the rest everything after that, which
 * the page renders below its device as markdown. Missing parts are empty.
 */
export function splitPageCopy(markdown: string): { title: string; intro: string; rest: string } {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	let i = 0;
	let title = "";
	while (i < lines.length) {
		const line = lines[i].trim();
		i++;
		if (!line) continue;
		if (line.startsWith("# ")) {
			title = line.slice(2).trim();
			break;
		}
		// Text before any heading: no title, it is the intro.
		i--;
		break;
	}
	while (i < lines.length && !lines[i].trim()) i++;
	const intro: string[] = [];
	while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith("#")) {
		intro.push(lines[i].trim());
		i++;
	}
	return { title, intro: intro.join(" "), rest: lines.slice(i).join("\n").trim() };
}
