import { render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vite-plus/test";
import EventTile from "./EventTile.svelte";

const show = {
	id: "event-1",
	kind: "show" as const,
	title: "Friday",
	status: "played" as const,
	startsOn: "2026-10-02",
	startsAt: "",
	venue: null,
	location: null,
	venueText: "",
	cityText: "",
	setCount: 0,
	sessionCount: 0,
	posterThumbnailUrl: null,
	posterUrl: null,
	ticketsSold: 85,
	attendance: 120,
	takeCents: 45000,
	createdAt: new Date(),
	updatedAt: new Date(),
};

describe("EventTile", () => {
	test("a show's line carries the tickets sold and the take in the currency", () => {
		render(EventTile, { props: { e: show, accountSlug: "band", currency: "EUR" } });
		expect(screen.getByRole("link")).toHaveTextContent("85 tickets · €450.00");
	});

	test("without them the line has neither", () => {
		render(EventTile, {
			props: { e: { ...show, ticketsSold: null, takeCents: null }, accountSlug: "band" },
		});
		expect(screen.getByRole("link")).not.toHaveTextContent("tickets");
		expect(screen.getByRole("link")).not.toHaveTextContent("$");
	});
});
