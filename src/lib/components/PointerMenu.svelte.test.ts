import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeAll, describe, expect, test, vi } from "vite-plus/test";
import PointerMenu from "./PointerMenu.svelte";

beforeAll(installFakePopover);

describe("PointerMenu", () => {
	test("nothing without a position; a position opens the menu at it; a new one opens it again after a dismiss", async () => {
		const action = vi.fn();
		const items = [{ label: "Seek here", action }];
		const { rerender } = render(PointerMenu, { props: { at: null, items } });
		expect(screen.queryByRole("button", { name: "Seek here" })).toBeNull();
		expect(document.querySelector("[popover]")).toBeNull();

		await rerender({ at: { x: 30, y: 50 }, items });
		await tick();
		const trigger = document.querySelector<HTMLElement>("button[popovertarget]")!;
		expect(trigger).toHaveAttribute("aria-label", "Actions at this spot");
		expect(trigger.style.left).toBe("30px");
		expect(trigger.style.top).toBe("50px");
		expect(screen.getByRole("button", { name: "Seek here" })).toBeVisible();

		await fireEvent.keyDown(document.body, { key: "Escape" });
		expect(screen.queryByRole("button", { name: "Seek here" })).toBeNull();

		// The same coordinates in a new object: the key remounts the menu, open.
		await rerender({ at: { x: 30, y: 50 }, items });
		await tick();
		expect(screen.getByRole("button", { name: "Seek here" })).toBeVisible();
		await fireEvent.click(screen.getByRole("button", { name: "Seek here" }));
		expect(action).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("button", { name: "Seek here" })).toBeNull();
	});
});
