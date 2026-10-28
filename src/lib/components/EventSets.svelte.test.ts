import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

const addEventSet = vi.fn();
const notify = vi.fn();
vi.mock("#lib/remote/events.remote.js", () => ({
	addEventSet,
	reorderEventSets: vi.fn(),
	removeEventSet: vi.fn(),
	updateEventSetLabel: vi.fn(),
}));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify }));

const { default: EventSets } = await import("./EventSets.svelte");

const choices = [
	{ id: "list-a", title: "Friday", itemCount: 12 },
	{ id: "list-b", title: "Encore", itemCount: 2 },
];
const props = { sets: [], eventId: "event-1", accountSlug: "band", choices, canEdit: true };

describe("EventSets", () => {
	beforeEach(() => {
		addEventSet.mockReset();
		notify.mockReset();
	});

	test("choosing a set list attaches it at once, with no button, and the picker returns to its prompt", async () => {
		const user = userEvent.setup();
		addEventSet.mockResolvedValue({
			id: "set-1",
			setListId: "list-a",
			label: "",
			sortOrder: 0,
			title: "Friday",
			itemCount: 12,
		});
		render(EventSets, { props });
		expect(screen.queryByRole("button", { name: /Attach/ })).toBeNull();
		const picker = screen.getByLabelText<HTMLSelectElement>("Attach a set list");
		await user.selectOptions(picker, "list-a");
		expect(addEventSet).toHaveBeenCalledWith({ eventId: "event-1", setListId: "list-a" });
		expect(await screen.findByRole("list", { name: "Set lists" })).toBeInTheDocument();
		expect(picker.value).toBe("");
		expect(picker).not.toBeDisabled();
	});

	test("a failure is a notification and the picker still returns to its prompt", async () => {
		const user = userEvent.setup();
		addEventSet.mockRejectedValue(new Error("This show has as many sets as it may."));
		render(EventSets, { props });
		const picker = screen.getByLabelText<HTMLSelectElement>("Attach a set list");
		await user.selectOptions(picker, "list-b");
		await vi.waitFor(() =>
			expect(notify).toHaveBeenCalledWith(
				"Could not attach the set list: This show has as many sets as it may.",
				{ kind: "error" },
			),
		);
		expect(picker.value).toBe("");
		expect(screen.getByText("No set lists yet.")).toBeInTheDocument();
	});
});
