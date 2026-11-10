import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import type { DashboardEntry } from "#lib/constants/dashboardLinks.js";
import DashboardIdeas from "./DashboardIdeas.svelte";

const base = {
	id: "dashboard-test",
	heading: "Your Things",
	empty: "No things yet.",
	action: { label: "Make a thing", href: "/things" },
	search: "Search things",
	tip: "Things you made.",
};

describe("DashboardIdeas", () => {
	test("with no ideas list it shows the empty card instead of throwing", () => {
		render(DashboardIdeas, { ...base, since: new Date() });
		expect(screen.getByText("No things yet.")).toBeTruthy();
		expect(screen.getByRole("link", { name: "Make a thing" }).getAttribute("href")).toBe("/things");
	});

	test("with an empty list it shows the empty card", () => {
		render(DashboardIdeas, { ...base, ideas: [] });
		expect(screen.getByText("No things yet.")).toBeTruthy();
	});

	describe("a super admin's acting entries", () => {
		const when = new Date("2026-11-01T12:00:00Z");
		const ideas: DashboardEntry[] = [
			{
				id: "a:stem:mine",
				title: "Mine",
				href: "/m",
				when,
				acting: { id: "stem:mine", noun: "stem" },
			},
			{ id: "a:stem:band", title: "Band's", href: "/b", when },
		];

		test("only an acting entry carries the tag and, with a handler, Remove", async () => {
			const onremove = vi.fn();
			render(DashboardIdeas, { ...base, ideas, onremove });
			expect(screen.getAllByText(/Yours, hidden from the band/)).toHaveLength(1);
			const buttons = screen.getAllByRole("button", { name: "Remove" });
			expect(buttons).toHaveLength(1);
			await fireEvent.click(buttons[0]);
			expect(onremove).toHaveBeenCalledWith(ideas[0]);
		});

		test("without a handler the tag shows and no Remove", () => {
			render(DashboardIdeas, { ...base, ideas });
			expect(screen.getByText(/Yours, hidden from the band/)).toBeTruthy();
			expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
		});
	});
});
