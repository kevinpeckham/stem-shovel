import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vite-plus/test";
import ComboBox from "./ComboBox.svelte";

const options = [
	{ value: "a", label: "Alpha", description: "2 takes" },
	{ value: "b", label: "Beta" },
	{ value: "c", label: "Gamma" },
];

describe("ComboBox", () => {
	test("shows the selection, opens a listbox and picks with the pointer", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		render(ComboBox, { options, value: "a", ariaLabel: "Idea", onchange });
		const trigger = screen.getByRole("combobox", { name: "Idea" });
		expect(trigger).toHaveTextContent("Alpha");
		expect(trigger).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByRole("listbox")).toBeNull();
		await user.click(trigger);
		expect(screen.getByRole("listbox", { name: "Idea" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: /Alpha/ })).toHaveAttribute("aria-selected", "true");
		await user.click(screen.getByRole("option", { name: "Beta" }));
		expect(onchange).toHaveBeenCalledWith("b");
		expect(screen.queryByRole("listbox")).toBeNull();
		expect(trigger).toHaveTextContent("Beta");
	});

	test("keyboard: arrows move, Enter picks, Escape closes", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		render(ComboBox, { options, value: "a", ariaLabel: "Idea", onchange });
		const trigger = screen.getByRole("combobox", { name: "Idea" });
		trigger.focus();
		await user.keyboard("{ArrowDown}");
		expect(screen.getByRole("listbox")).toBeInTheDocument();
		await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
		expect(onchange).toHaveBeenCalledWith("c");
		await user.keyboard("{ArrowDown}");
		expect(screen.getByRole("listbox")).toBeInTheDocument();
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	test("closes on an outside pointerdown and shows the placeholder when nothing matches", async () => {
		const user = userEvent.setup();
		render(ComboBox, { options, value: "zzz", ariaLabel: "Idea", placeholder: "Pick one" });
		const trigger = screen.getByRole("combobox", { name: "Idea" });
		expect(trigger).toHaveTextContent("Pick one");
		await user.click(trigger);
		expect(screen.getByRole("listbox")).toBeInTheDocument();
		await user.click(document.body);
		expect(screen.queryByRole("listbox")).toBeNull();
	});
});
