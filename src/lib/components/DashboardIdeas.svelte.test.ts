import { render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vite-plus/test";
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
});
