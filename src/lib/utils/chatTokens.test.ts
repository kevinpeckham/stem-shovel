import { describe, expect, it } from "vite-plus/test";
import { chatTokens } from "./chatTokens";

describe("chatTokens", () => {
	it("plain text is one run", () => {
		expect(chatTokens("Louder bass please")).toEqual([
			{ kind: "text", text: "Louder bass please" },
		]);
	});
	it("a position in time becomes a seek, with seconds, decimals and hours read", () => {
		expect(chatTokens("the drop at 1:23 is late")).toEqual([
			{ kind: "text", text: "the drop at " },
			{ kind: "position", text: "1:23", seconds: 83 },
			{ kind: "text", text: " is late" },
		]);
		expect(chatTokens("0:45.5 and 1:02:03")).toEqual([
			{ kind: "position", text: "0:45.5", seconds: 45.5 },
			{ kind: "text", text: " and " },
			{ kind: "position", text: "1:02:03", seconds: 3723 },
		]);
	});
	it("a time of day, a ratio of sixty or more, or digits joined to a word are not positions", () => {
		expect(chatTokens("at 10:30pm")).toEqual([{ kind: "text", text: "at 10:30pm" }]);
		expect(chatTokens("odds 1:75")).toEqual([{ kind: "text", text: "odds 1:75" }]);
		expect(chatTokens("v1:23")).toEqual([{ kind: "text", text: "v1:23" }]);
		expect(chatTokens("3:15.")).toEqual([
			{ kind: "position", text: "3:15", seconds: 195 },
			{ kind: "text", text: "." },
		]);
	});
	it("a URL becomes a link, without the sentence's trailing punctuation", () => {
		expect(chatTokens("see https://example.com/a?b=1, ok")).toEqual([
			{ kind: "text", text: "see " },
			{ kind: "url", text: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
			{ kind: "text", text: ", ok" },
		]);
		expect(chatTokens("(https://en.wikipedia.org/wiki/Foo_(bar))")).toEqual([
			{ kind: "text", text: "(" },
			{
				kind: "url",
				text: "https://en.wikipedia.org/wiki/Foo_(bar)",
				href: "https://en.wikipedia.org/wiki/Foo_(bar)",
			},
			{ kind: "text", text: ")" },
		]);
	});
	it("a position inside a URL stays part of the URL", () => {
		expect(chatTokens("https://example.com/t/1:23 at 1:23")).toEqual([
			{ kind: "url", text: "https://example.com/t/1:23", href: "https://example.com/t/1:23" },
			{ kind: "text", text: " at " },
			{ kind: "position", text: "1:23", seconds: 83 },
		]);
	});
});
