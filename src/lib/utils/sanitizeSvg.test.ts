import { describe, expect, it } from "vite-plus/test";
import { sanitizeSvg } from "./sanitizeSvg";

describe("sanitizeSvg", () => {
	it("keeps drawing and text", () => {
		const svg =
			'<svg viewBox="0 0 10 10"><g class="note"><path d="M0 0"/><text>Fine</text></g></svg>';
		expect(sanitizeSvg(svg)).toBe(svg);
	});
	it("drops scripts, handlers, foreign objects and javascript links", () => {
		const svg =
			'<svg><script>alert(1)</script><g onclick="x()" onLoad=\'y()\'><a xlink:href="javascript:z()">t</a></g><foreignObject><div>html</div></foreignObject></svg>';
		expect(sanitizeSvg(svg)).toBe('<svg><g><a xlink:href="#">t</a></g></svg>');
	});
});
