import { render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vite-plus/test";

const { default: Page } = await import("./+page.svelte");

describe("Built with page", () => {
	test("every group is a region named by its heading, with an id free of whitespace", () => {
		const { container } = render(Page);
		const headings = [...container.querySelectorAll("section > h2")];
		expect(headings.length).toBeGreaterThan(1);
		for (const h of headings) {
			expect(h.id).toMatch(/^\S+$/);
			expect(screen.getByRole("region", { name: h.textContent ?? "" })).toBe(h.parentElement);
		}
		expect(new Set(headings.map((h) => h.id)).size).toBe(headings.length);
	});
});
