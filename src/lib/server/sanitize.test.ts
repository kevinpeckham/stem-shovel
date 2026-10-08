import { describe, expect, it } from "vite-plus/test";
import { renderMarkdown } from "./markdown";
import { sanitizeHtml } from "./sanitize";

/**
 * sanitizeHtml guards every rendered markdown field (user docs, song notes,
 * comments, support replies). These tests pin its actual behaviour: what is
 * dropped with its content, what is unwrapped (text kept), which attributes
 * survive, and how URL attributes are scheme-checked. Where the behaviour is
 * looser than a reader might expect, the test says so in a comment rather
 * than changing the sanitizer.
 */

describe("sanitizeHtml: elements dropped with their content", () => {
	// DROP_WITH_CONTENT removes the element and everything inside it; the
	// siblings around it are untouched.
	it("drops script with its content", () => {
		expect(sanitizeHtml("<p>a</p><script>alert(1)</script><p>b</p>")).toBe("<p>a</p><p>b</p>");
	});
	it("drops style with its content", () => {
		expect(sanitizeHtml("<style>p{color:red}</style><p>x</p>")).toBe("<p>x</p>");
	});
	it("drops iframe with its content", () => {
		expect(sanitizeHtml('<iframe src="https://x"><p>inner</p></iframe><p>after</p>')).toBe(
			"<p>after</p>",
		);
	});
	it("drops object with its fallback content", () => {
		expect(sanitizeHtml('<object data="x"><p>fallback</p></object>')).toBe("");
	});
	it("drops embed", () => {
		expect(sanitizeHtml('<embed src="x"><p>after</p>')).toBe("<p>after</p>");
	});
	it("drops form with everything inside it, inputs and paragraphs alike", () => {
		expect(sanitizeHtml('<form action="/x"><input type="text" name="q"><p>inside</p></form>')).toBe(
			"",
		);
	});
	it("drops template with its content", () => {
		expect(sanitizeHtml("<template><p>t</p></template><p>after</p>")).toBe("<p>after</p>");
	});
	it("drops noscript, button, select, textarea, link, meta, base and title with their content", () => {
		expect(sanitizeHtml("<noscript><p>n</p></noscript>")).toBe("");
		expect(sanitizeHtml("<button>b</button><select><option>o</option></select>")).toBe("");
		expect(sanitizeHtml("<textarea><p>t</p></textarea><p>after</p>")).toBe("<p>after</p>");
		expect(sanitizeHtml('<link rel="x"><meta charset="x"><base href="x"><title>t</title>')).toBe(
			"",
		);
	});
	it("drops elements regardless of tag-name case", () => {
		expect(sanitizeHtml('<SCRIPT>a</SCRIPT><IMG SRC="javascript:x" ONERROR="y"><P>p</P>')).toBe(
			"<img><p>p</p>",
		);
	});
	it("keeps a checkbox input only, as a disabled display-only box", () => {
		// `input` is on the allowlist for GFM task lists. A checkbox keeps its
		// type and checked state and is forced disabled...
		expect(sanitizeHtml('<input type="checkbox" checked>')).toBe(
			'<input type="checkbox" checked="" disabled="">',
		);
		expect(sanitizeHtml('<input type="checkbox" checked disabled>')).toBe(
			'<input type="checkbox" checked="" disabled="">',
		);
		expect(sanitizeHtml('<input type="CheckBox">')).toBe('<input type="CheckBox" disabled="">');
		// ...while any other kind, or no kind, is dropped whole: a text box was never part of a task list.
		expect(sanitizeHtml('a<input type="text" name="q">b')).toBe("ab");
		expect(sanitizeHtml('<input type="radio">')).toBe("");
		expect(sanitizeHtml("<input>")).toBe("");
		expect(sanitizeHtml('<input type="checkbox" form="f" formaction="javascript:x">')).toBe(
			'<input type="checkbox" disabled="">',
		);
	});
});

describe("sanitizeHtml: event handler attributes", () => {
	it("drops onerror on img", () => {
		expect(sanitizeHtml('<img src="https://x/y.png" onerror="alert(1)" alt="a">')).toBe(
			'<img src="https://x/y.png" alt="a">',
		);
	});
	it("drops onclick on a", () => {
		expect(sanitizeHtml('<a href="https://x" onclick="alert(1)">t</a>')).toBe(
			'<a href="https://x">t</a>',
		);
	});
	it("drops onload on div", () => {
		expect(sanitizeHtml('<div onload="x">d</div>')).toBe("<div>d</div>");
	});
});

describe("sanitizeHtml: URL attributes", () => {
	// A rejected URL attribute is removed; the element and its text remain.
	it("drops a javascript: href", () => {
		expect(sanitizeHtml('<a href="javascript:alert(1)">t</a>')).toBe("<a>t</a>");
	});
	it("drops a data: href and a data: image src", () => {
		// No image data is permitted: data: is not in the scheme allowlist at all.
		expect(sanitizeHtml('<a href="data:text/html,x">t</a>')).toBe("<a>t</a>");
		expect(sanitizeHtml('<img src="data:image/png;base64,AAAA">')).toBe("<img>");
	});
	it("drops a vbscript: href", () => {
		expect(sanitizeHtml('<a href="vbscript:msgbox">t</a>')).toBe("<a>t</a>");
	});
	it("drops a case-obfuscated JaVaScRiPt: href, even with the attribute name upper-cased", () => {
		expect(sanitizeHtml('<a href="JaVaScRiPt:alert(1)">t</a>')).toBe("<a>t</a>");
		expect(sanitizeHtml('<a HREF="JavaScript:alert(1)">t</a>')).toBe("<a>t</a>");
	});
	it("drops a whitespace-obfuscated java\\tscript: and java\\nscript: href", () => {
		expect(sanitizeHtml('<a href="java\tscript:alert(1)">t</a>')).toBe("<a>t</a>");
		expect(sanitizeHtml('<a href="java\nscript:alert(1)">t</a>')).toBe("<a>t</a>");
	});
	it("drops an entity-encoded &#106;avascript: href (parse5 decodes it before the check)", () => {
		expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">t</a>')).toBe("<a>t</a>");
		expect(sanitizeHtml('<a href="&#x6A;avascript:alert(1)">t</a>')).toBe("<a>t</a>");
	});
	it("drops a javascript: href behind leading whitespace, a control character or a zero-width space", () => {
		expect(sanitizeHtml('<a href="  javascript:alert(1)">t</a>')).toBe("<a>t</a>");
		// Written with fromCharCode: the formatter turns \uXXXX escapes into the
		// literal (invisible) characters, which a reader could not see.
		const control = String.fromCharCode(0x01);
		const zeroWidth = String.fromCharCode(0x200b);
		expect(sanitizeHtml(`<a href="${control}javascript:alert(1)">t</a>`)).toBe("<a>t</a>");
		expect(sanitizeHtml(`<a href="${zeroWidth}javascript:alert(1)">t</a>`)).toBe("<a>t</a>");
		expect(sanitizeHtml(`<a href="javascript${zeroWidth}:alert(1)">t</a>`)).toBe("<a>t</a>");
	});
	it("drops a javascript: src on img, nested inside a dropped-href link", () => {
		expect(sanitizeHtml('<a href="javascript:x"><img src="javascript:y" onerror="z"></a>')).toBe(
			"<a><img></a>",
		);
	});
	it("drops schemes outside http, https, mailto and tel, such as ftp:", () => {
		expect(sanitizeHtml('<a href="ftp://x">t</a>')).toBe("<a>t</a>");
	});
	it("drops a scheme-less href that holds a colon", () => {
		// "x:y" and "foo/bar:baz" could be a scheme a browser accepts, so both go.
		expect(sanitizeHtml('<a href="x:y">r</a>')).toBe("<a>r</a>");
		expect(sanitizeHtml('<a href="foo/bar:baz">p</a>')).toBe("<a>p</a>");
	});
	it("keeps a percent-encoded javascript%3A href, which browsers treat as a relative path", () => {
		// Harmless: the scheme delimiter must be a literal colon for a browser to
		// see a scheme, so this navigates to ./javascript%3Aalert(1).
		expect(sanitizeHtml('<a href="javascript%3Aalert(1)">t</a>')).toBe(
			'<a href="javascript%3Aalert(1)">t</a>',
		);
	});
	it("drops a protocol-relative //host href and the backslash forms browsers read the same way", () => {
		// "//evil.com/x" has no scheme and no forbidden character, yet a browser
		// resolves it to another origin while it reads as a local path. Browsers
		// also turn "/\\host" and "\\\\host" into "//host".
		expect(sanitizeHtml('<a href="//evil.com/x">p</a>')).toBe("<a>p</a>");
		expect(sanitizeHtml('<a href="/\\evil.com/x">p</a>')).toBe("<a>p</a>");
		expect(sanitizeHtml('<a href="\\\\evil.com/x">p</a>')).toBe("<a>p</a>");
		expect(sanitizeHtml('<a href=" //evil.com">p</a>')).toBe("<a>p</a>");
		expect(sanitizeHtml('<img src="//evil.com/x.png">')).toBe("<img>");
	});
	it("drops a relative href holding a backslash, which browsers read as a slash", () => {
		expect(sanitizeHtml('<a href="/x\\..\\y">p</a><a href="x\\y">p</a>')).toBe("<a>p</a><a>p</a>");
	});
	it("drops src on an element whose allowlist has no src, and href where there is no href", () => {
		expect(sanitizeHtml('<img srcdoc="x" src="https://x">')).toBe('<img src="https://x">');
		expect(sanitizeHtml('<div src="https://x" href="https://y">d</div>')).toBe("<div>d</div>");
	});
});

describe("sanitizeHtml: allowed links", () => {
	it("keeps an http(s) href with its query string and title, and adds no rel or target", () => {
		// The implementation adds nothing: no rel="noopener", no target.
		expect(sanitizeHtml('<a href="https://example.com/x?y=1&z=2" title="T">t</a>')).toBe(
			'<a href="https://example.com/x?y=1&amp;z=2" title="T">t</a>',
		);
		expect(sanitizeHtml('<a href="http://x">t</a><a href="HTTPS://X">t</a>')).toBe(
			'<a href="http://x">t</a><a href="HTTPS://X">t</a>',
		);
	});
	it("drops target and rel supplied by the input", () => {
		expect(sanitizeHtml('<a href="https://x" target="_blank" rel="noopener">t</a>')).toBe(
			'<a href="https://x">t</a>',
		);
	});
	it("keeps mailto: and tel: hrefs", () => {
		expect(sanitizeHtml('<a href="mailto:a@b.c">m</a><a href="tel:+1">t</a>')).toBe(
			'<a href="mailto:a@b.c">m</a><a href="tel:+1">t</a>',
		);
	});
	it("keeps root-relative, dot-relative, fragment and bare relative hrefs", () => {
		expect(
			sanitizeHtml('<a href="/x">r</a><a href="./x">r</a><a href="#f">r</a><a href="x/y">r</a>'),
		).toBe('<a href="/x">r</a><a href="./x">r</a><a href="#f">r</a><a href="x/y">r</a>');
	});
	it("drops name on a", () => {
		// `name` on an anchor is a document named property (document.x): the same
		// DOM-clobbering handle the id rule guards against. Markdown never emits it.
		expect(sanitizeHtml('<a name="x">n</a>')).toBe("<a>n</a>");
		expect(sanitizeHtml('<a name="footnote-1" href="#f">n</a>')).toBe('<a href="#f">n</a>');
	});
});

describe("sanitizeHtml: svg and math", () => {
	it("removes svg with a nested script and foreignObject", () => {
		expect(
			sanitizeHtml(
				"<svg><script>1</script><foreignObject><p>f</p></foreignObject></svg><p>after</p>",
			),
		).toBe("<p>after</p>");
	});
	it("removes math with its content", () => {
		expect(sanitizeHtml("<math><mi>x</mi></math><p>a</p>")).toBe("<p>a</p>");
	});
});

describe("sanitizeHtml: unknown elements and attributes", () => {
	it("unwraps unknown elements, keeping their text and allowed children", () => {
		expect(
			sanitizeHtml(
				'<marquee>m</marquee><custom-el><b>b</b></custom-el><video src="x">v</video><audio>a</audio>',
			),
		).toBe("m<b>b</b>va");
		expect(sanitizeHtml("<details><summary>s</summary>c</details>")).toBe("sc");
	});
	it("unwraps html, head and body, dropping the title inside head", () => {
		expect(sanitizeHtml("<html><head><title>t</title></head><body><p>b</p></body></html>")).toBe(
			"<p>b</p>",
		);
	});
	it("drops comments", () => {
		expect(sanitizeHtml("<!-- c --><p>x</p>")).toBe("<p>x</p>");
	});
	it("drops style, id and data-* attributes but keeps class and title", () => {
		expect(sanitizeHtml('<p style="color:red" class="c" id="x" data-x="1" title="t">p</p>')).toBe(
			'<p class="c" title="t">p</p>',
		);
	});
	it("keeps an id only when it starts with footnote-", () => {
		expect(
			sanitizeHtml(
				'<a id="footnote-1">f</a><a id="user-content-fn-1">g</a><sup id="footnote-ref-1">s</sup>',
			),
		).toBe('<a id="footnote-1">f</a><a>g</a><sup id="footnote-ref-1">s</sup>');
	});
	it("keeps src, alt, title, width and height on img and drops style and loading", () => {
		expect(
			sanitizeHtml(
				'<img src="/a.png" alt="A" title="T" width="10" height="20" style="x" loading="lazy">',
			),
		).toBe('<img src="/a.png" alt="A" title="T" width="10" height="20">');
		// Non-URL attributes are not value-checked; a bogus width is harmless.
		expect(sanitizeHtml('<img src="https://x" width="javascript:x">')).toBe(
			'<img src="https://x" width="javascript:x">',
		);
	});
	it("keeps an img with no src", () => {
		expect(sanitizeHtml('<img alt="A">')).toBe('<img alt="A">');
	});
	it("keeps align on td and th and drops colspan, rowspan and style", () => {
		expect(
			sanitizeHtml(
				'<table><thead><tr><th align="left">h</th></tr></thead><tbody><tr><td align="right" style="x">d</td></tr></tbody><tfoot><tr><td>f</td></tr></tfoot></table>',
			),
		).toBe(
			'<table><thead><tr><th align="left">h</th></tr></thead><tbody><tr><td align="right">d</td></tr></tbody><tfoot><tr><td>f</td></tr></tfoot></table>',
		);
		expect(sanitizeHtml('<td colspan="2" rowspan="3">x</td>')).toBe("<td>x</td>");
	});
	it("keeps class on code (fenced block language) and start on ol", () => {
		expect(sanitizeHtml('<pre><code class="language-js">x</code></pre>')).toBe(
			'<pre><code class="language-js">x</code></pre>',
		);
		expect(sanitizeHtml('<ol start="3"><li>a</li></ol>')).toBe('<ol start="3"><li>a</li></ol>');
	});
	it("keeps the footnote data attributes, aria-label and aria-describedby, and drops other aria-*", () => {
		// marked-footnote emits aria-describedby on the reference and aria-label
		// on the back link, which screen readers need; the rest of aria-* stays out.
		expect(
			sanitizeHtml(
				'<sup><a id="footnote-ref-1" href="#footnote-1" data-footnote-ref aria-describedby="footnote-label">1</a></sup>',
			),
		).toBe(
			'<sup><a id="footnote-ref-1" href="#footnote-1" data-footnote-ref="" aria-describedby="footnote-label">1</a></sup>',
		);
		expect(
			sanitizeHtml(
				'<section class="footnotes" data-footnotes><h2 id="footnote-label" class="sr-only">Footnotes</h2><ol><li id="footnote-1"><p>n <a href="#footnote-ref-1" data-footnote-backref aria-label="Back">back</a></p></li></ol></section>',
			),
		).toBe(
			'<section class="footnotes" data-footnotes=""><h2 id="footnote-label" class="sr-only">Footnotes</h2><ol><li id="footnote-1"><p>n <a href="#footnote-ref-1" data-footnote-backref="" aria-label="Back">back</a></p></li></ol></section>',
		);
		expect(sanitizeHtml('<p aria-hidden="true" aria-live="polite" role="alert">x</p>')).toBe(
			"<p>x</p>",
		);
	});
});

describe("sanitizeHtml: the GFM output marked emits survives intact", () => {
	it("keeps headings, hr, br, blockquote, em, strong and del", () => {
		const html =
			"<h1>1</h1><h2>2</h2><h3>3</h3><h4>4</h4><h5>5</h5><h6>6</h6><hr><br><blockquote><p>q</p></blockquote><em>e</em><strong>s</strong><del>d</del>";
		expect(sanitizeHtml(html)).toBe(html);
	});
	it("keeps lists with task-list checkboxes", () => {
		const html =
			'<ul><li>a</li><li><input disabled="" type="checkbox"> todo</li><li><input checked="" disabled="" type="checkbox"> done</li></ul><ol><li>one</li></ol>';
		expect(sanitizeHtml(html)).toBe(html);
	});
	it("keeps the other inline and definition elements on the allowlist", () => {
		const html =
			'<dl><dt>t</dt><dd>d</dd></dl><abbr title="x">a</abbr><kbd>k</kbd><mark>m</mark><sub>s</sub><sup>s</sup><ins>i</ins><s>s</s><u>u</u><small>s</small><b>b</b><i>i</i><div><span>x</span></div>';
		expect(sanitizeHtml(html)).toBe(html);
	});
});

describe("sanitizeHtml: text", () => {
	it("escapes a raw < in text and keeps existing entities escaped", () => {
		expect(sanitizeHtml("a < b")).toBe("a &lt; b");
		expect(sanitizeHtml("<p>a &lt; b &amp; c &gt; d</p>")).toBe("<p>a &lt; b &amp; c &gt; d</p>");
	});
	it("escapes & and quotes in attribute values", () => {
		// parse5's serializer escapes &, " and nbsp in attribute values; < is
		// legal there and stays as is.
		expect(sanitizeHtml('<a href="https://x" title="a&quot;b<c>">t</a>')).toBe(
			'<a href="https://x" title="a&quot;b<c>">t</a>',
		);
	});
	it("returns an empty string for an empty string", () => {
		expect(sanitizeHtml("")).toBe("");
	});
});

describe("renderMarkdown round trip", () => {
	const markdown = [
		"# Title",
		"",
		'A [link](https://example.com "T") and ![alt](https://example.com/i.png).',
		"",
		"- [ ] todo",
		"- [x] done",
		"",
		"| h1 | h2 |",
		"|:---|---:|",
		"| a | b |",
		"",
		"```js",
		"const x = 1 < 2;",
		"```",
		"",
		"Footnote[^1].",
		"",
		"[^1]: The note.",
		"",
		"<script>alert(1)</script>",
		"",
		'<a href="javascript:alert(1)">raw</a>',
		"",
		"a < b & c",
	].join("\n");

	it("renders the link, image, table, code block and footnotes and strips the raw HTML attack", () => {
		const html = renderMarkdown(markdown);
		expect(html).toContain('<a href="https://example.com" title="T">link</a>');
		expect(html).toContain('<img src="https://example.com/i.png" alt="alt">');
		expect(html).toContain('<li><input disabled="" type="checkbox"> todo</li>');
		expect(html).toContain('<li><input checked="" disabled="" type="checkbox"> done</li>');
		expect(html).toContain('<th align="left">h1</th>');
		expect(html).toContain('<td align="right">b</td>');
		expect(html).toContain('<pre><code class="language-js">const x = 1 &lt; 2;\n</code></pre>');
		expect(html).toContain(
			'<sup><a id="footnote-ref-1" href="#footnote-1" data-footnote-ref="" aria-describedby="footnote-label">1</a></sup>',
		);
		expect(html).toContain('<section class="footnotes" data-footnotes="">');
		expect(html).toContain('<li id="footnote-1">');
		expect(html).toMatch(/<a href="#footnote-ref-1" data-footnote-backref="" aria-label="[^"]+">/);
		expect(html).toContain("<p>a &lt; b &amp; c</p>");
		expect(html).not.toContain("<script");
		expect(html).not.toContain("alert(1)");
		expect(html).not.toContain("javascript:");
		expect(html).toContain("<p><a>raw</a></p>");
	});
	it("is idempotent: sanitizing the rendered output again changes nothing", () => {
		const html = renderMarkdown(markdown);
		expect(sanitizeHtml(html)).toBe(html);
	});
	it("renders blank markdown as an empty string", () => {
		expect(renderMarkdown("")).toBe("");
		expect(renderMarkdown("  \n\t")).toBe("");
	});
	it("keeps autolinked URLs and email addresses", () => {
		expect(renderMarkdown("see https://example.com now and a@b.c")).toBe(
			'<p>see <a href="https://example.com">https://example.com</a> now and <a href="mailto:a@b.c">a@b.c</a></p>\n',
		);
	});
});
