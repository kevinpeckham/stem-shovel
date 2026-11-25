import { idsWithWhitespace } from "./idsWithWhitespace";
import { describe, expect, test } from "vite-plus/test";

describe("idsWithWhitespace", () => {
	test("names each id that holds a space, tab or line break, once", () => {
		const html = `<section aria-labelledby="built-The app"><h2 id="built-The app">The app</h2></section>
			<h2 id='built-Data and files'>x</h2><p id="a\tb"></p><h2 id="built-The app">again</h2>`;
		expect(idsWithWhitespace(html)).toEqual(["built-The app", "built-Data and files", "a\tb"]);
	});

	test("a page of plain ids has none", () => {
		expect(idsWithWhitespace(`<main id="main"><h2 id="built-the-app">The app</h2></main>`)).toEqual(
			[],
		);
	});

	test("only the id attribute counts: not data-id, aria-labelledby or a class", () => {
		const html = `<p data-id="a b" aria-labelledby="x y" class="one two" grid="a b">id="in text"</p>`;
		expect(idsWithWhitespace(html)).toEqual([]);
	});

	test("what a script or a style carries is not markup", () => {
		const html = `<script>const s = '<p id="a b">';</script><style>/* id="c d" */</style><p id="e f"></p>`;
		expect(idsWithWhitespace(html)).toEqual(["e f"]);
	});
});
