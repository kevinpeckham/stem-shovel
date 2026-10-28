import { render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vite-plus/test";
import LocationDetails from "./LocationDetails.svelte";

describe("LocationDetails", () => {
	test("the address, Directions, labeled notes and Edit location", () => {
		render(LocationDetails, {
			location: { name: "The garage", address: "12 Elm St", notes: "Side door" },
			editHref: "/band/practice-locations/l1",
		});
		const group = screen.getByRole("group", { name: "Location details" });
		expect(group).toHaveTextContent("12 Elm St");
		expect(screen.getByRole("link", { name: "Directions" }).getAttribute("href")).toContain(
			encodeURIComponent("The garage, 12 Elm St"),
		);
		expect(screen.getByText("Notes")).toBeInTheDocument();
		expect(screen.getByText("Side door")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Edit location" })).toHaveAttribute(
			"href",
			"/band/practice-locations/l1",
		);
	});

	test("no address: no Directions; no notes: no Notes label", () => {
		render(LocationDetails, {
			location: { name: "The garage", address: " ", notes: "" },
			editHref: "/band/practice-locations/l1",
		});
		expect(screen.queryByRole("link", { name: "Directions" })).toBeNull();
		expect(screen.queryByText("Notes")).toBeNull();
		expect(screen.getByRole("link", { name: "Edit location" })).toBeInTheDocument();
	});
});
