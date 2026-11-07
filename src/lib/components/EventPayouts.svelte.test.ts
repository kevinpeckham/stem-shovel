import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

const addEventPayout = vi.fn();
const removeEventPayout = vi.fn();
const updateEventPayout = vi.fn();
const notify = vi.fn();
vi.mock("#lib/remote/events.remote.js", () => ({
	addEventPayout,
	removeEventPayout,
	updateEventPayout,
}));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify }));

const { default: EventPayouts } = await import("./EventPayouts.svelte");

const members = [
	{ userId: "user-sam", name: "Sam" },
	{ userId: "user-ana", name: "Ana" },
];
const payouts = [
	{ id: "pay-1", userId: "user-sam", name: "Sam", amountCents: 10000, note: "", sortOrder: 0 },
	{ id: "pay-2", userId: null, name: "Sound guy", amountCents: 5050, note: "cash", sortOrder: 1 },
];
const props = {
	payouts,
	eventId: "event-1",
	members,
	currency: "USD",
	takeCents: 45000 as number | null,
	canEdit: true,
};

describe("EventPayouts", () => {
	beforeEach(() => {
		addEventPayout.mockReset();
		removeEventPayout.mockReset();
		updateEventPayout.mockReset();
		notify.mockReset();
	});
	afterEach(() => vi.restoreAllMocks());

	test("lists each payout with the sum paid out and what is left of the take", () => {
		render(EventPayouts, { props });
		const list = screen.getByRole("list", { name: "Payouts" });
		expect(list).toHaveTextContent("Sam");
		expect(list).toHaveTextContent("$100.00");
		expect(list).toHaveTextContent("Sound guy");
		expect(list).toHaveTextContent("$50.50");
		expect(list).toHaveTextContent("cash");
		expect(screen.getByText("Paid out $150.50")).toBeInTheDocument();
		expect(screen.getByText("$299.50 left")).toBeInTheDocument();
	});

	test("more paid out than the take reads in red; exactly the take is nothing left", () => {
		const { unmount } = render(EventPayouts, { props: { ...props, takeCents: 10000 } });
		expect(screen.getByText("-$50.50 left")).toHaveClass("text-red-400");
		unmount();
		render(EventPayouts, { props: { ...props, takeCents: 15050 } });
		expect(screen.getByText("nothing left")).toBeInTheDocument();
	});

	test("without a take there is no left line", () => {
		render(EventPayouts, { props: { ...props, takeCents: null } });
		expect(screen.getByText("Paid out $150.50")).toBeInTheDocument();
		expect(screen.queryByText(/left$/)).toBeNull();
	});

	test("Add payout posts the fields and appends the returned row, clearing the form", async () => {
		const user = userEvent.setup();
		addEventPayout.mockResolvedValue({
			id: "pay-3",
			userId: null,
			name: "Opener",
			amountCents: 2000,
			note: "gas",
			sortOrder: 2,
		});
		render(EventPayouts, { props });
		await user.selectOptions(screen.getByLabelText("New payout: who"), "other");
		await user.type(screen.getByLabelText("New payout: name"), "Opener");
		await user.type(screen.getByLabelText("New payout: amount"), "20");
		await user.type(screen.getByLabelText("New payout: note"), "gas");
		await user.click(screen.getByRole("button", { name: "Add payout" }));
		expect(addEventPayout).toHaveBeenCalledWith({
			eventId: "event-1",
			userId: "",
			name: "Opener",
			amount: "20",
			note: "gas",
		});
		expect(await screen.findByText("Opener")).toBeInTheDocument();
		expect(screen.getByText("Paid out $170.50")).toBeInTheDocument();
		expect(screen.getByLabelText<HTMLInputElement>("New payout: amount").value).toBe("");
		expect(screen.getByLabelText<HTMLSelectElement>("New payout: who").value).toBe("");
	});

	test("a member's payout posts the member's id and no name", async () => {
		const user = userEvent.setup();
		addEventPayout.mockResolvedValue({
			...payouts[0],
			id: "pay-4",
			userId: "user-ana",
			name: "Ana",
		});
		render(EventPayouts, { props });
		await user.selectOptions(screen.getByLabelText("New payout: who"), "user-ana");
		expect(screen.queryByLabelText("New payout: name")).toBeNull();
		await user.type(screen.getByLabelText("New payout: amount"), "100");
		await user.click(screen.getByRole("button", { name: "Add payout" }));
		expect(addEventPayout).toHaveBeenCalledWith({
			eventId: "event-1",
			userId: "user-ana",
			name: "",
			amount: "100",
			note: "",
		});
	});

	test("a refused add is a notification", async () => {
		const user = userEvent.setup();
		addEventPayout.mockRejectedValue(new Error("Enter the amount"));
		render(EventPayouts, { props });
		await user.selectOptions(screen.getByLabelText("New payout: who"), "user-sam");
		await user.click(screen.getByRole("button", { name: "Add payout" }));
		await vi.waitFor(() =>
			expect(notify).toHaveBeenCalledWith("Could not add the payout: Enter the amount", {
				kind: "error",
			}),
		);
	});

	test("Remove calls the remote once confirmed and drops the row", async () => {
		const user = userEvent.setup();
		vi.spyOn(window, "confirm").mockReturnValue(true);
		removeEventPayout.mockResolvedValue({ ok: true });
		render(EventPayouts, { props });
		await user.click(screen.getByRole("button", { name: "Remove the payout to Sound guy" }));
		expect(removeEventPayout).toHaveBeenCalledWith({ id: "pay-2" });
		await vi.waitFor(() => expect(screen.queryByText("Sound guy")).toBeNull());
		expect(screen.getByText("Paid out $100.00")).toBeInTheDocument();
	});

	test("Edit saves through the remote and shows the returned row", async () => {
		const user = userEvent.setup();
		updateEventPayout.mockResolvedValue({ ...payouts[1], amountCents: 7500, note: "cash, tip" });
		render(EventPayouts, { props });
		await user.click(screen.getByRole("button", { name: "Edit the payout to Sound guy" }));
		const amount = screen.getByLabelText<HTMLInputElement>("Payout to Sound guy: amount");
		expect(amount.value).toBe("50.50");
		expect(screen.getByLabelText<HTMLInputElement>("Payout to Sound guy: name").value).toBe(
			"Sound guy",
		);
		await user.clear(amount);
		await user.type(amount, "75");
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(updateEventPayout).toHaveBeenCalledWith({
			id: "pay-2",
			userId: "",
			name: "Sound guy",
			amount: "75",
			note: "cash",
		});
		expect(await screen.findByText("$75.00")).toBeInTheDocument();
	});

	test("a viewer sees the rows and no controls; with none, a line saying so", () => {
		const { unmount } = render(EventPayouts, { props: { ...props, canEdit: false } });
		expect(screen.getByText("Sound guy")).toBeInTheDocument();
		expect(screen.queryByRole("button")).toBeNull();
		expect(screen.queryByRole("combobox")).toBeNull();
		unmount();
		render(EventPayouts, { props: { ...props, payouts: [], canEdit: false } });
		expect(screen.getByText("No payouts recorded.")).toBeInTheDocument();
	});
});
