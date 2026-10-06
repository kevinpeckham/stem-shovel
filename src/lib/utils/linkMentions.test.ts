import { describe, expect, it } from "vite-plus/test";
import { linkMentions } from "./linkMentions";

const targets = [
	{ label: "Chart", href: "/f/abc" },
	{ label: "Chart v2", href: "/f/def" },
	{ label: "Rough mix", href: "#demo-d1" },
	{ label: "Tom & Jerry", href: "/f/amp" },
];

describe("linkMentions", () => {
	it("links @Label in text, longest label first, keeping the target's own spelling", () => {
		expect(linkMentions("<p>see @chart v2 and @CHART.</p>", targets)).toBe(
			'<p>see <a class="mention" href="/f/def">@Chart v2</a> and <a class="mention" href="/f/abc">@Chart</a>.</p>',
		);
	});
	it("needs the label to end at the end, whitespace or punctuation", () => {
		expect(linkMentions("<p>@Charts are not @Chart</p>", targets)).toBe(
			'<p>@Charts are not <a class="mention" href="/f/abc">@Chart</a></p>',
		);
		expect(linkMentions("<p>(@Chart)</p>", targets)).toBe(
			'<p>(<a class="mention" href="/f/abc">@Chart</a>)</p>',
		);
	});
	it("leaves an @ glued to a word alone (an e-mail address)", () => {
		expect(linkMentions("<p>mail kevin@chart now</p>", targets)).toBe(
			"<p>mail kevin@chart now</p>",
		);
	});
	it("never touches tags, attributes or the text of an existing link", () => {
		const html = '<p title="@Chart"><a href="/x">@Chart <b>@Chart</b></a> @Chart</p>';
		expect(linkMentions(html, targets)).toBe(
			'<p title="@Chart"><a href="/x">@Chart <b>@Chart</b></a> <a class="mention" href="/f/abc">@Chart</a></p>',
		);
	});
	it("matches a label the renderer escaped, and escapes what it writes", () => {
		expect(linkMentions("<p>@Tom &amp; Jerry</p>", targets)).toBe(
			'<p><a class="mention" href="/f/amp">@Tom &amp; Jerry</a></p>',
		);
		expect(linkMentions("<p>@x</p>", [{ label: "x", href: '/f/a"><script>' }])).toBe(
			'<p><a class="mention" href="/f/a&quot;&gt;&lt;script&gt;">@x</a></p>',
		);
	});
	it("ignores empty labels and HTML without an @", () => {
		expect(linkMentions("<p>plain</p>", targets)).toBe("<p>plain</p>");
		expect(linkMentions("<p>@ nothing</p>", [{ label: "  ", href: "/f/a" }])).toBe(
			"<p>@ nothing</p>",
		);
	});
});
