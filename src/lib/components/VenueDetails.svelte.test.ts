import { render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vite-plus/test";
import VenueDetails from "./VenueDetails.svelte";

const base = {
	place: "1822 W Sunset Blvd, Los Angeles",
	directions: "https://maps.example/echo",
	website: "https://theecho.com",
	contact: "Sam",
	notes: "Load in the back",
};

describe("VenueDetails", () => {
	test("a venue: the links, contact and labeled notes, no hint", () => {
		render(VenueDetails, { ...base, editHref: "/band/venues/v1", legacy: false });
		const group = screen.getByRole("group", { name: "Venue details" });
		expect(group).toHaveTextContent("1822 W Sunset Blvd, Los Angeles");
		expect(screen.getByRole("link", { name: "Directions" })).toHaveAttribute(
			"href",
			"https://maps.example/echo",
		);
		expect(screen.getByRole("link", { name: "Website" })).toHaveAttribute(
			"href",
			"https://theecho.com",
		);
		expect(screen.getByRole("link", { name: "Edit venue" })).toHaveAttribute(
			"href",
			"/band/venues/v1",
		);
		expect(screen.getByText("Contact: Sam")).toBeInTheDocument();
		expect(screen.getByText("Your notes")).toBeInTheDocument();
		expect(screen.queryByText(/From before venues/)).toBeNull();
	});

	test("the free text from before venues: no edit link, no notes label, the hint", () => {
		render(VenueDetails, {
			...base,
			website: "",
			contact: "",
			editHref: null,
			legacy: true,
		});
		expect(screen.queryByRole("link", { name: "Edit venue" })).toBeNull();
		expect(screen.queryByRole("link", { name: "Website" })).toBeNull();
		expect(screen.queryByText(/Contact:/)).toBeNull();
		expect(screen.queryByText("Your notes")).toBeNull();
		expect(screen.getByText("Load in the back")).toBeInTheDocument();
		expect(
			screen.getByText("From before venues; pick or create a venue to replace it."),
		).toBeInTheDocument();
	});

	test("no links at all: no link row", () => {
		const { container } = render(VenueDetails, {
			place: "Somewhere",
			directions: "",
			website: "",
			contact: "",
			notes: "",
			editHref: null,
			legacy: true,
		});
		expect(container.querySelectorAll("a")).toHaveLength(0);
		expect(container.querySelectorAll("p")).toHaveLength(2);
	});
});
