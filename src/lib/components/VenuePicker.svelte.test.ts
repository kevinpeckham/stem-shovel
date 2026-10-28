import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

const searchVenues = vi.fn();
const linkVenue = vi.fn();
const createVenue = vi.fn();
const notify = vi.fn();
vi.mock("#lib/remote/venues.remote.js", () => ({ searchVenues, linkVenue, createVenue }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify }));

const { default: VenuePicker } = await import("./VenuePicker.svelte");

// jsdom has no popover API (and hides a closed one): a stand-in that records
// the opens, sends `beforetoggle` and shows or hides the element.
const shown = vi.fn();
const toggle = (el: HTMLElement, newState: "open" | "closed") => {
	el.dispatchEvent(Object.assign(new Event("beforetoggle"), { newState }));
	el.style.display = newState === "open" ? "block" : "none";
};
HTMLElement.prototype.showPopover = function () {
	shown(this.id);
	toggle(this, "open");
};
HTMLElement.prototype.hidePopover = function () {
	toggle(this, "closed");
};
/** Opens the Find or add popover the way a person does: from the select. */
const openFind = (user: ReturnType<typeof userEvent.setup>) =>
	user.selectOptions(screen.getByLabelText("Venue"), "__find");

const choices = [
	{ id: "v-echo", name: "The Echo", city: "Los Angeles" },
	{ id: "v-room", name: "The practice room", city: "" },
];
const row = (over: object) => ({
	id: "v-new",
	name: "Zebulon",
	address: "",
	city: "Los Angeles",
	mapUrl: "",
	websiteUrl: "",
	notes: "",
	contact: "",
	eventCount: 0,
	createdAt: new Date(),
	updatedAt: new Date(),
	...over,
});
const props = { choices, value: "", accountId: "acct-1", canCreate: true };
const venueSelect = (c: HTMLElement) =>
	c.querySelector<HTMLSelectElement>('select[aria-label="Venue"]')!;

describe("VenuePicker", () => {
	beforeEach(() => {
		searchVenues.mockReset();
		linkVenue.mockReset();
		createVenue.mockReset();
		notify.mockReset();
		shown.mockReset();
	});

	test("lists No venue, each venue with its city when set, and Find or add a venue…", () => {
		render(VenuePicker, { props });
		const select = screen.getByLabelText<HTMLSelectElement>("Venue");
		expect([...select.options].map((o) => o.textContent)).toEqual([
			"No venue",
			"The Echo · Los Angeles",
			"The practice room",
			"Find or add a venue…",
		]);
	});

	test("without canCreate there is no Find or add option", () => {
		render(VenuePicker, { props: { ...props, canCreate: false } });
		expect(screen.queryByRole("option", { name: "Find or add a venue…" })).toBeNull();
	});

	test("picking a venue sets the select", async () => {
		const user = userEvent.setup();
		const { container } = render(VenuePicker, { props });
		await user.selectOptions(screen.getByLabelText("Venue"), "v-echo");
		expect(venueSelect(container).value).toBe("v-echo");
	});

	test("Find or add a venue… opens the popover and leaves the select where it was", async () => {
		const user = userEvent.setup();
		const { container } = render(VenuePicker, { props: { ...props, value: "v-echo" } });
		const select = screen.getByLabelText<HTMLSelectElement>("Venue");
		await user.selectOptions(select, "__find");
		expect(shown).toHaveBeenCalledTimes(1);
		expect(select.value).toBe("v-echo");
		expect(venueSelect(container).value).toBe("v-echo");
	});

	test("a search result links the venue and the select takes it", async () => {
		const user = userEvent.setup();
		searchVenues.mockResolvedValue([{ id: "v-new", name: "Zebulon", city: "Los Angeles" }]);
		linkVenue.mockResolvedValue(row({}));
		const onadded = vi.fn();
		const { container } = render(VenuePicker, { props: { ...props, onadded } });
		await openFind(user);
		await user.type(screen.getByLabelText("Search venues"), "zeb");
		const result = await screen.findByRole(
			"button",
			{ name: /Zebulon · Los Angeles/ },
			{ timeout: 2000 },
		);
		expect(searchVenues).toHaveBeenCalledWith({ q: "zeb" });
		await user.click(result);
		expect(linkVenue).toHaveBeenCalledWith({ accountId: "acct-1", venueId: "v-new" });
		await vi.waitFor(() => expect(venueSelect(container).value).toBe("v-new"));
		expect(onadded).toHaveBeenCalledWith(expect.objectContaining({ id: "v-new" }));
		expect(notify).toHaveBeenCalledWith("Venue added");
		expect(screen.getByLabelText<HTMLSelectElement>("Venue").value).toBe("v-new");
	});

	test("New venue creates one with the name prefilled from the search", async () => {
		const user = userEvent.setup();
		searchVenues.mockResolvedValue([]);
		createVenue.mockResolvedValue(row({ id: "v-made", name: "Moroccan Lounge", city: "" }));
		const { container } = render(VenuePicker, { props });
		await openFind(user);
		await user.type(screen.getByLabelText("Search venues"), "Moroccan Lounge");
		await user.click(screen.getByRole("button", { name: "New venue" }));
		expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Moroccan Lounge");
		await user.type(screen.getByLabelText("Website"), "https://moroccan.example");
		await user.click(screen.getByRole("button", { name: "Create" }));
		expect(createVenue).toHaveBeenCalledWith({
			accountId: "acct-1",
			name: "Moroccan Lounge",
			address: "",
			city: "",
			mapUrl: "",
			websiteUrl: "https://moroccan.example",
		});
		await vi.waitFor(() => expect(venueSelect(container).value).toBe("v-made"));
		expect(screen.getByRole("option", { name: "Moroccan Lounge" })).toBeInTheDocument();
	});
});
