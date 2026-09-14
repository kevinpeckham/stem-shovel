import { describe, expect, test } from "vite-plus/test";
import { renderEmail } from "./renderEmail";

describe("renderEmail", () => {
	test("renders greeting, paragraphs, a button with its bare link, and a footer", () => {
		const { html, text } = renderEmail({
			greeting: "Hi Kevin,",
			lines: ["Verify your address."],
			cta: { label: "Verify email", url: "https://example.com/v?t=1&x=2" },
			footer: "Ignore this if it was not you.",
		});
		expect(html).toContain("Hi Kevin,");
		expect(html).toContain('href="https://example.com/v?t=1&amp;x=2"');
		expect(html).toContain(">Verify email<");
		expect(text).toBe(
			"Hi Kevin,\n\nVerify your address.\n\nVerify email: https://example.com/v?t=1&x=2\n\nIgnore this if it was not you.",
		);
	});
	test("escapes user-supplied text in the HTML body", () => {
		const { html, text } = renderEmail({
			greeting: "Hi <b>x</b>,",
			lines: ['She said "go" & left'],
		});
		expect(html).toContain("Hi &lt;b&gt;x&lt;/b&gt;,");
		expect(html).toContain("She said &quot;go&quot; &amp; left");
		expect(text).toContain('She said "go" & left');
	});
});
