import { describe, expect, it } from "vite-plus/test";
import { unescapeChartMarkdown } from "./unescapeChartMarkdown.js";

describe("unescapeChartMarkdown", () => {
	it("removes the editor's escapes anywhere in the text", () => {
		expect(unescapeChartMarkdown(String.raw`\| D \| A \|`)).toBe("| D | A |");
		expect(unescapeChartMarkdown(String.raw`\*\*I - Intro\*\*`)).toBe("**I - Intro**");
		expect(unescapeChartMarkdown(String.raw`\## Verse`)).toBe("## Verse");
		expect(unescapeChartMarkdown(String.raw`| \[2/4\] D\_E\_F |`)).toBe("| [2/4] D_E_F |");
	});
	it("leaves other backslashes and clean text alone", () => {
		expect(unescapeChartMarkdown(String.raw`a \n \. b`)).toBe(String.raw`a \n \. b`);
		expect(unescapeChartMarkdown("| D | A |")).toBe("| D | A |");
	});
});
