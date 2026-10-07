import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { createRawSnippet, tick, type ComponentProps } from "svelte";
import { beforeAll, describe, expect, test, vi } from "vite-plus/test";
import ContextMenu from "./ContextMenu.svelte";

beforeAll(installFakePopover);

const custom = createRawSnippet(() => ({ render: () => `<p data-testid="custom">Custom</p>` }));

/**
 * Props with an accessor for `openState`, so the component's `bind:openState`
 * writes reach the test (Svelte binds through the props object's setter when
 * a component is mounted directly, as Testing Library does).
 */
function boundProps(items: ContextMenuItems) {
	let openState: "open" | "closed" = "closed";
	return {
		items,
		get openState() {
			return openState;
		},
		set openState(v: "open" | "closed") {
			openState = v;
		},
		read: () => openState,
	};
}
type ContextMenuItems = NonNullable<ComponentProps<typeof ContextMenu>["items"]>;

describe("ContextMenu", () => {
	test("the trigger carries the aria-label and invokes a closed popover", async () => {
		render(ContextMenu, { props: { ariaLabel: "Song actions", items: [{ label: "Rename" }] } });
		const trigger = screen.getByRole("button", { name: "Song actions" });
		const popover = document.querySelector("[popover]") as HTMLElement;
		expect(trigger).toHaveAttribute("popovertarget", popover.id);
		await tick();
		expect(popover.style.display).toBe("none");
		expect(screen.queryByText("Rename")).toBeNull();
	});

	test("clicking the trigger opens the menu; a button item runs its action and closes it", async () => {
		const user = userEvent.setup();
		const action = vi.fn();
		const props = boundProps([{ label: "Delete", action }]);
		render(ContextMenu, { props });
		await user.click(screen.getByRole("button", { name: "More actions" }));
		expect(props.read()).toBe("open");
		const item = screen.getByRole("button", { name: "Delete" });
		expect(item).toBeVisible();
		await user.click(item);
		expect(action).toHaveBeenCalledTimes(1);
		expect(props.read()).toBe("closed");
		expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
	});

	test("items: links carry href, title and target; disabled buttons do not fire; condition hides", async () => {
		const user = userEvent.setup();
		const action = vi.fn();
		const hidden = vi.fn();
		render(ContextMenu, {
			props: {
				items: [
					{ label: "Open song", href: "/band/songs/s1", title: "Go", target: "_blank" },
					{ label: "Download", action, disabled: true },
					{ label: "Never", action: hidden, condition: false },
					{ label: "Neither", action: hidden, condition: () => false },
					{ label: "Shown", action, condition: () => true },
				],
			},
		});
		await user.click(screen.getByRole("button", { name: "More actions" }));
		const link = screen.getByRole("link", { name: "Open song" });
		expect(link).toHaveAttribute("href", "/band/songs/s1");
		expect(link).toHaveAttribute("title", "Go");
		expect(link).toHaveAttribute("target", "_blank");
		const download = screen.getByRole("button", { name: "Download" });
		expect(download).toBeDisabled();
		await user.click(download);
		expect(action).not.toHaveBeenCalled();
		expect(screen.queryByText("Never")).toBeNull();
		expect(screen.queryByText("Neither")).toBeNull();
		expect(screen.getByRole("button", { name: "Shown" })).toBeInTheDocument();
		expect(hidden).not.toHaveBeenCalled();
	});

	test("divider, heading, notice and snippet kinds render", async () => {
		const user = userEvent.setup();
		render(ContextMenu, {
			props: {
				items: [
					{ kind: "heading", label: "Stems" },
					{ kind: "notice", notice: "Decoding…" },
					{ kind: "divider", id: "d" },
					{ kind: "snippet", snippet: custom },
					{ label: () => "Dynamic", action: () => {} },
				],
			},
		});
		await user.click(screen.getByRole("button", { name: "More actions" }));
		expect(screen.getByText("Stems")).toHaveClass("uppercase");
		expect(screen.getByText("Decoding…")).toBeInTheDocument();
		expect(screen.getByTestId("custom")).toHaveTextContent("Custom");
		expect(screen.getByRole("button", { name: "Dynamic" })).toBeInTheDocument();
		// One list item per rendered item; the divider is an empty one.
		const items = screen.getAllByRole("listitem");
		expect(items).toHaveLength(5);
		expect(items[2]).toHaveTextContent("");
		expect(items[2].querySelector("div")).toHaveClass("border-b");
	});

	test("Escape closes the menu and the binding follows", async () => {
		const user = userEvent.setup();
		const props = boundProps([{ label: "Rename", action: () => {} }]);
		render(ContextMenu, { props });
		await user.click(screen.getByRole("button", { name: "More actions" }));
		expect(props.read()).toBe("open");
		await user.keyboard("{Escape}");
		expect(props.read()).toBe("closed");
		expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
	});

	test("focus leaving the menu closes it", async () => {
		const user = userEvent.setup();
		const props = boundProps([{ label: "Rename", action: () => {} }]);
		render(ContextMenu, { props });
		const outside = document.createElement("button");
		document.body.append(outside);
		await user.click(screen.getByRole("button", { name: "More actions" }));
		const item = screen.getByRole("button", { name: "Rename" });
		// Focus moving within the menu keeps it open; moving out closes it.
		await fireEvent.focusOut(item, { relatedTarget: item });
		expect(props.read()).toBe("open");
		await fireEvent.focusOut(item, { relatedTarget: outside });
		expect(props.read()).toBe("closed");
		outside.remove();
	});

	test("openState opens the menu from the parent, and rerendering it closed closes it", async () => {
		const { rerender } = render(ContextMenu, {
			props: { openState: "open", items: [{ label: "Rename", action: () => {} }] },
		});
		await tick();
		expect(screen.getByRole("button", { name: "Rename" })).toBeVisible();
		await rerender({ openState: "closed" });
		expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
	});

	test("a disabled trigger renders disabled, with a label after the icon", () => {
		render(ContextMenu, { props: { disabled: true, label: "Options", ariaLabel: "Options" } });
		const trigger = screen.getByRole("button", { name: "Options" });
		expect(trigger).toBeDisabled();
		expect(trigger).toHaveTextContent("Options");
	});
});
