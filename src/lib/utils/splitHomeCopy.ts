/**
 * The home page's copy doc (docs/page-copy.md, "The home page") into its
 * parts. The first `# ` heading is the headline, the first paragraph after
 * it the page's description, and each `## ` heading opens a section whose
 * `### ` headings are its items (a feature block's topic heading; the
 * FAQ's questions). A heading may end in `{#id}`, the key its place on the
 * page is looked up by; without one the key is the heading's own words,
 * lower-cased and hyphenated. Paragraphs are lines up to a blank one,
 * joined, as markdown; HTML comments are notes to the editor and go.
 */
export interface HomeCopyItem {
	id: string;
	heading: string;
	paragraphs: string[];
}
export interface HomeCopySection extends HomeCopyItem {
	items: HomeCopyItem[];
}
export interface HomeCopy {
	title: string;
	intro: string;
	sections: HomeCopySection[];
}

function headingOf(line: string): { heading: string; id: string } {
	const m = line.match(/^(.*?)\s*\{#([\w-]+)\}\s*$/);
	const heading = (m ? m[1] : line).trim();
	const id =
		m?.[2] ??
		heading
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
	return { heading, id };
}

export function splitHomeCopy(markdown: string): HomeCopy {
	const lines = markdown
		.replace(/\r\n/g, "\n")
		.replace(/<!--[\s\S]*?-->/g, "")
		.split("\n");
	const copy: HomeCopy = { title: "", intro: "", sections: [] };
	let section: HomeCopySection | null = null;
	let item: HomeCopyItem | null = null;
	let paragraph: string[] = [];
	const flush = () => {
		if (!paragraph.length) return;
		const text = paragraph.join(" ");
		paragraph = [];
		const target = item ?? section;
		if (target) target.paragraphs.push(text);
		else if (!copy.intro) copy.intro = text;
	};
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) {
			flush();
			continue;
		}
		if (line.startsWith("### ") && section) {
			flush();
			item = { ...headingOf(line.slice(4)), paragraphs: [] };
			section.items.push(item);
		} else if (line.startsWith("## ")) {
			flush();
			item = null;
			section = { ...headingOf(line.slice(3)), paragraphs: [], items: [] };
			copy.sections.push(section);
		} else if (line.startsWith("# ") && !section && !copy.title) {
			flush();
			copy.title = line.slice(2).trim();
		} else {
			paragraph.push(line);
		}
	}
	flush();
	return copy;
}
