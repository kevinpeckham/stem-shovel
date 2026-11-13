import { fakeRemoteForm } from "../../../tests/helpers/fakeRemoteForm";
import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The song player's arrangement switcher (docs/arrangements.md): Main and
 * the alternates as links that keep the page's other query, the shown one's
 * note and creator, and an editor's + and ⋯ (Rename, Duplicate, Delete) over
 * stand-in remote functions.
 */
const h = vi.hoisted(() => ({
	page: { url: new URL("https://stem-shovel.test/band/projects/p/song?share=XYZ") },
	goto: vi.fn(async () => {}),
	notify: vi.fn(),
	deleteArrangement: vi.fn(async () => {}),
}));
vi.mock("$app/state", () => ({ page: h.page }));
vi.mock("$app/navigation", () => ({ goto: h.goto }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: h.notify }));
vi.mock("#lib/remote/arrangements.remote.js", () => ({
	createArrangement: fakeRemoteForm({ id: "new1" }),
	updateArrangement: fakeRemoteForm({ id: "alt1" }),
	deleteArrangement: h.deleteArrangement,
}));

const { default: ArrangementSwitcher } = await import("./ArrangementSwitcher.svelte");
const remote = await import("#lib/remote/arrangements.remote.js");
/** The stand-in forms' submit spies. */
const submitOf = (form: unknown) => (form as { submit: ReturnType<typeof vi.fn> }).submit;

beforeAll(installFakePopover);
beforeEach(() => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

const alternate = (id: string, name: string, note = "") => ({
	id,
	name,
	note,
	creator: { id: "u1", name: "Dawn" },
});
const two = [alternate("alt1", "Acoustic", "Unplugged take"), alternate("alt2", "Dawn's ideas")];
const props = (over: Record<string, unknown> = {}) => ({
	arrangements: two,
	arrangementId: null,
	songId: "song1",
	canEdit: true,
	...over,
});
const nav = () => screen.getByRole("navigation", { name: "Arrangements" });

describe("ArrangementSwitcher", () => {
	test("Main and each alternate are links keeping the page's other query; the shown one is current", () => {
		render(ArrangementSwitcher, { props: props({ arrangementId: "alt1" }) });
		const links = within(nav()).getAllByRole("link");
		expect(links.map((l) => l.textContent?.trim())).toEqual(["Main", "Acoustic", "Dawn's ideas"]);
		expect(links[0]).toHaveAttribute("href", "/band/projects/p/song?share=XYZ");
		expect(links[1]).toHaveAttribute("href", "/band/projects/p/song?share=XYZ&arrangement=alt1");
		expect(links[1]).toHaveAttribute("aria-current", "page");
		expect(links[0]).not.toHaveAttribute("aria-current");
		expect(links[1]).toHaveAttribute("data-sveltekit-reset", "false");
		expect(screen.getByText(/Unplugged take/)).toHaveTextContent("Unplugged take · by Dawn");
	});

	test("an alternate with settings of its own says so under the row, to a viewer too", () => {
		const own = [{ ...alternate("alt1", "Acoustic", "Unplugged take"), settingsOwn: true }];
		render(ArrangementSwitcher, {
			props: props({ arrangements: own, arrangementId: "alt1", canEdit: false }),
		});
		expect(screen.getByText(/Unplugged take/)).toHaveTextContent(
			"Unplugged take · by Dawn · own tempo",
		);
	});

	test("an info tip says what the row is; an editor is also told about + and ⋯", () => {
		const { unmount } = render(ArrangementSwitcher, { props: props({ canEdit: true }) });
		expect(screen.getByRole("button", { name: "About arrangements" })).toBeInTheDocument();
		const tip = screen.getByRole("note", { hidden: true });
		expect(tip).toHaveTextContent("Arrangements are sets of stems for this song.");
		expect(tip).toHaveTextContent("makes a new arrangement");
		expect(tip).toHaveTextContent("renames, duplicates or deletes");
		unmount();
		render(ArrangementSwitcher, { props: props({ canEdit: false }) });
		const viewers = screen.getByRole("note", { hidden: true });
		expect(viewers).toHaveTextContent("Click one to switch to its stems.");
		expect(viewers).not.toHaveTextContent("makes a new arrangement");
	});

	test("on Main, Main is current and no ⋯ menu shows", () => {
		render(ArrangementSwitcher, { props: props() });
		expect(within(nav()).getByRole("link", { name: "Main" })).toHaveAttribute(
			"aria-current",
			"page",
		);
		expect(screen.queryByRole("button", { name: /options/ })).toBeNull();
		expect(screen.getByRole("button", { name: "New arrangement" })).toBeEnabled();
	});

	test("a viewer sees nothing without alternates, and no editing controls with them", () => {
		const { unmount } = render(ArrangementSwitcher, {
			props: props({ arrangements: [], canEdit: false }),
		});
		expect(screen.queryByRole("navigation")).toBeNull();
		unmount();
		render(ArrangementSwitcher, { props: props({ canEdit: false, arrangementId: "alt1" }) });
		expect(nav()).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "New arrangement" })).toBeNull();
		expect(screen.queryByRole("button", { name: /options/ })).toBeNull();
	});

	test("an editor sees Main and + on a song without alternates", () => {
		render(ArrangementSwitcher, { props: props({ arrangements: [] }) });
		expect(
			within(nav())
				.getAllByRole("link")
				.map((l) => l.textContent?.trim()),
		).toEqual(["Main"]);
		expect(screen.getByRole("button", { name: "New arrangement" })).toBeInTheDocument();
	});

	test("at the limit, + is disabled and says why", () => {
		const many = Array.from({ length: 12 }, (_, i) => alternate(`a${i}`, `Take ${i}`));
		render(ArrangementSwitcher, { props: props({ arrangements: many }) });
		const plus = screen.getByRole("button", { name: "New arrangement" });
		expect(plus).toBeDisabled();
		expect(plus.parentElement).toHaveAttribute(
			"title",
			"A song holds at most 12 arrangements besides Main",
		);
	});

	test("+ opens the form starting from the arrangement shown; Create notifies and opens the new one", async () => {
		const user = userEvent.setup();
		render(ArrangementSwitcher, { props: props({ arrangementId: "alt2" }) });
		await user.click(screen.getByRole("button", { name: "New arrangement" }));
		const form = screen.getByRole("form", { name: "New arrangement" });
		const select = within(form).getByLabelText("Start from") as HTMLSelectElement;
		expect([...select.options].map((o) => o.textContent)).toEqual([
			"Main",
			"Acoustic",
			"Dawn's ideas",
			"Empty",
		]);
		expect(select.value).toBe("alt2");
		await fireEvent.submit(form);
		await waitFor(() => expect(h.notify).toHaveBeenCalledWith("Arrangement created"));
		expect(submitOf(remote.createArrangement)).toHaveBeenCalledOnce();
		expect(h.goto).toHaveBeenCalledWith("/band/projects/p/song?share=XYZ&arrangement=new1", {
			reset: false,
		});
	});

	test("⋯ Rename opens the name and note form; Save notifies", async () => {
		const user = userEvent.setup();
		render(ArrangementSwitcher, { props: props({ arrangementId: "alt1" }) });
		await user.click(screen.getByRole("button", { name: "Acoustic: options" }));
		await user.click(screen.getByRole("button", { name: "Rename…" }));
		const form = screen.getByRole("form", { name: "Rename arrangement" });
		expect(within(form).getByLabelText("Name")).toHaveValue("Acoustic");
		expect(within(form).getByLabelText("Note (optional)")).toHaveValue("Unplugged take");
		await fireEvent.submit(form);
		await waitFor(() => expect(h.notify).toHaveBeenCalledWith("Arrangement saved"));
		expect(submitOf(remote.updateArrangement)).toHaveBeenCalledOnce();
	});

	test("⋯ Duplicate opens the new form starting from this arrangement", async () => {
		const user = userEvent.setup();
		render(ArrangementSwitcher, { props: props({ arrangementId: "alt1" }) });
		await user.click(screen.getByRole("button", { name: "Acoustic: options" }));
		await user.click(screen.getByRole("button", { name: "Duplicate…" }));
		const form = screen.getByRole("form", { name: "New arrangement" });
		expect(within(form).getByLabelText("Start from")).toHaveValue("alt1");
	});

	test("⋯ Delete confirms, saying shared stems stay; then deletes and goes to Main", async () => {
		const user = userEvent.setup();
		const confirm = vi.fn((_message: string) => false);
		vi.stubGlobal("confirm", confirm);
		render(ArrangementSwitcher, { props: props({ arrangementId: "alt1" }) });
		const del = async () => {
			await user.click(screen.getByRole("button", { name: "Acoustic: options" }));
			await user.click(screen.getByRole("button", { name: "Delete…" }));
		};
		await del();
		expect(confirm.mock.calls[0]?.[0]).toMatch(/stems shared with other arrangements stay/);
		expect(h.deleteArrangement).not.toHaveBeenCalled();
		confirm.mockReturnValue(true);
		await del();
		await waitFor(() => expect(h.notify).toHaveBeenCalledWith("Arrangement deleted"));
		expect(h.deleteArrangement).toHaveBeenCalledWith({ id: "alt1" });
		expect(h.goto).toHaveBeenCalledWith("/band/projects/p/song?share=XYZ", { reset: false });
	});

	test("a failed delete notifies the error and stays", async () => {
		const user = userEvent.setup();
		vi.stubGlobal(
			"confirm",
			vi.fn(() => true),
		);
		h.deleteArrangement.mockRejectedValueOnce(new Error("Not a member"));
		render(ArrangementSwitcher, { props: props({ arrangementId: "alt1" }) });
		await user.click(screen.getByRole("button", { name: "Acoustic: options" }));
		await user.click(screen.getByRole("button", { name: "Delete…" }));
		await waitFor(() =>
			expect(h.notify).toHaveBeenCalledWith("Could not delete the arrangement: Not a member", {
				kind: "error",
			}),
		);
		expect(h.goto).not.toHaveBeenCalled();
	});
});
