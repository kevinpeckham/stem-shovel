import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

const createPracticeLocation = vi.fn();
const notify = vi.fn();
vi.mock("#lib/remote/practiceLocations.remote.js", () => ({ createPracticeLocation }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify }));

const { default: LocationPicker } = await import("./LocationPicker.svelte");

// jsdom has no popover API: a stand-in that records the opens, sends
// `beforetoggle` and shows or hides the element.
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

const choices = [
	{ id: "l-garage", name: "The garage" },
	{ id: "l-room", name: "Room 4" },
];
const props = { choices, value: "", accountId: "acct-1", canCreate: true };
const select = () => screen.getByLabelText<HTMLSelectElement>("Location");

describe("LocationPicker", () => {
	beforeEach(() => {
		createPracticeLocation.mockReset();
		notify.mockReset();
		shown.mockReset();
	});

	test("lists No location, each location and New location…", () => {
		render(LocationPicker, { props });
		expect([...select().options].map((o) => o.textContent)).toEqual([
			"No location",
			"The garage",
			"Room 4",
			"New location…",
		]);
	});

	test("without canCreate there is no New location option", () => {
		render(LocationPicker, { props: { ...props, canCreate: false } });
		expect(screen.queryByRole("option", { name: "New location…" })).toBeNull();
	});

	test("picking a location sets the select", async () => {
		const user = userEvent.setup();
		render(LocationPicker, { props });
		await user.selectOptions(select(), "l-room");
		expect(select().value).toBe("l-room");
	});

	test("New location… opens the popover and leaves the select where it was", async () => {
		const user = userEvent.setup();
		render(LocationPicker, { props: { ...props, value: "l-garage" } });
		await user.selectOptions(select(), "__new");
		expect(shown).toHaveBeenCalledTimes(1);
		expect(select().value).toBe("l-garage");
	});

	test("Create without a name asks for one", async () => {
		const user = userEvent.setup();
		render(LocationPicker, { props });
		await user.selectOptions(select(), "__new");
		await user.click(screen.getByRole("button", { name: "Create" }));
		expect(screen.getByText("Give the location a name.")).toBeInTheDocument();
		expect(createPracticeLocation).not.toHaveBeenCalled();
	});

	test("Create adds the location and the select takes it", async () => {
		const user = userEvent.setup();
		const row = {
			id: "l-new",
			name: "Studio B",
			address: "12 Elm St",
			notes: "Side door",
			eventCount: 0,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		createPracticeLocation.mockResolvedValue(row);
		const onadded = vi.fn();
		render(LocationPicker, { props: { ...props, onadded } });
		await user.selectOptions(select(), "__new");
		await user.type(screen.getByLabelText("Name"), "Studio B");
		await user.type(screen.getByLabelText("Address"), "12 Elm St");
		await user.type(screen.getByLabelText("Notes"), "Side door");
		await user.click(screen.getByRole("button", { name: "Create" }));
		expect(createPracticeLocation).toHaveBeenCalledWith({
			accountId: "acct-1",
			name: "Studio B",
			address: "12 Elm St",
			notes: "Side door",
		});
		await vi.waitFor(() => expect(select().value).toBe("l-new"));
		expect(screen.getByRole("option", { name: "Studio B" })).toBeInTheDocument();
		expect(onadded).toHaveBeenCalledWith(row);
		expect(notify).toHaveBeenCalledWith("Location added");
	});

	test("a failed create says so and leaves the select alone", async () => {
		const user = userEvent.setup();
		createPracticeLocation.mockRejectedValue(
			new Error("You already have a location by that name."),
		);
		render(LocationPicker, { props });
		await user.selectOptions(select(), "__new");
		await user.type(screen.getByLabelText("Name"), "The garage");
		await user.click(screen.getByRole("button", { name: "Create" }));
		await vi.waitFor(() =>
			expect(notify).toHaveBeenCalledWith(
				"Could not add the location: You already have a location by that name.",
				{ kind: "error" },
			),
		);
		expect(select().value).toBe("");
	});
});
